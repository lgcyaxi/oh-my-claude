use std::fs;
use crate::proxy_client::ProxyClient;
use crate::registry::read_registry;
use crate::types::{MemoryModelConfig, ModelInfo, ProviderInfo, SessionInfo, SwitchResponse};

/// List all active sessions with live status from their control APIs
#[tauri::command]
pub async fn list_sessions() -> Vec<SessionInfo> {
    list_sessions_inner().await
}

/// Inner implementation shared with tray menu refresh
pub async fn list_sessions_inner() -> Vec<SessionInfo> {
    let entries = read_registry();
    let client = ProxyClient::new();
    let mut sessions = Vec::new();

    for entry in entries {
        let project_name = entry
            .cwd
            .as_deref()
            .and_then(|p| p.rsplit('/').next())
            .unwrap_or("unknown")
            .to_string();

        // Query live status from control API
        let (switched, provider, model, healthy) =
            match client.get_status(entry.control_port, &entry.session_id).await {
                Ok(status) => (
                    status.switched,
                    status.provider,
                    status.model,
                    true,
                ),
                Err(_) => {
                    // Try health check to see if proxy is alive at all
                    let is_healthy = client.get_health(entry.control_port).await.is_ok();
                    (false, None, None, is_healthy)
                }
            };

        sessions.push(SessionInfo {
            session_id: entry.session_id,
            port: entry.port,
            control_port: entry.control_port,
            pid: entry.pid,
            started_at: entry.started_at,
            cwd: entry.cwd,
            project_name,
            switched,
            provider,
            model,
            healthy,
            source: entry.source.clone(),
        });
    }

    sessions
}

/// Switch a session's model
#[tauri::command]
pub async fn switch_model(
    control_port: u16,
    session_id: String,
    provider: String,
    model: String,
) -> Result<SwitchResponse, String> {
    let client = ProxyClient::new();
    client.switch_model(control_port, &session_id, &provider, &model).await
}

/// Revert a session to native Claude
#[tauri::command]
pub async fn revert_model(
    control_port: u16,
    session_id: String,
) -> Result<SwitchResponse, String> {
    let client = ProxyClient::new();
    client.revert_model(control_port, &session_id).await
}

/// Get memory model configuration from proxy
#[tauri::command]
pub async fn get_memory_config(control_port: u16) -> Result<MemoryModelConfig, String> {
    let client = ProxyClient::new();
    client.get_memory_config(control_port).await
}

/// Set memory model to a specific provider/model
#[tauri::command]
pub async fn set_memory_config(
    control_port: u16,
    provider: String,
    model: String,
) -> Result<MemoryModelConfig, String> {
    let client = ProxyClient::new();
    client.set_memory_config(control_port, Some(&provider), Some(&model)).await
}

/// Reset memory model to auto (passthrough)
#[tauri::command]
pub async fn reset_memory_config(control_port: u16) -> Result<MemoryModelConfig, String> {
    let client = ProxyClient::new();
    client.set_memory_config(control_port, None, None).await
}

/// Get the installed oh-my-claude version from package.json
#[tauri::command]
pub fn get_version() -> String {
    if let Some(home) = dirs::home_dir() {
        let pkg_path = home.join(".claude").join("oh-my-claude").join("package.json");
        if let Ok(contents) = fs::read_to_string(&pkg_path) {
            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&contents) {
                if let Some(ver) = pkg.get("version").and_then(|v| v.as_str()) {
                    return format!("v{}", ver);
                }
            }
        }
    }
    "unknown".to_string()
}

/// Get available providers and their models
#[tauri::command]
pub fn get_providers() -> Vec<ProviderInfo> {
    get_providers_inner()
}

/// Discover Ollama models via /api/tags (called from frontend for empty model lists)
#[tauri::command]
pub async fn discover_ollama_models() -> Vec<ModelInfo> {
    // Check env vars for custom Ollama host (OLLAMA_HOST or OLLAMA_API_BASE)
    let env_host = std::env::var("OLLAMA_HOST")
        .or_else(|_| std::env::var("OLLAMA_API_BASE"))
        .ok()
        .map(|h| h.trim_end_matches('/').replace("/v1", "").to_string());

    let mut hosts_vec: Vec<String> = Vec::new();
    if let Some(h) = env_host {
        hosts_vec.push(h);
    }
    hosts_vec.push("http://localhost:11434".to_string());
    hosts_vec.push("http://127.0.0.1:11434".to_string());
    // Dedup in case env matches a default
    hosts_vec.dedup();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    // Non-LLM model patterns to filter out
    let non_llm_patterns = [
        "bge-", "nomic-embed", "mxbai-embed", "snowflake-arctic-embed",
        "all-minilm", "paraphrase-", "minicpm-v", "llava", "bakllava",
        "moondream", "granite3-guardian",
    ];
    let non_llm_suffixes = ["-ocr", "-embedding"];

    for host in &hosts_vec {
        let url = format!("{}/api/tags", host);
        if let Ok(resp) = client.get(&url).send().await {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(models) = data.get("models").and_then(|m| m.as_array()) {
                    return models
                        .iter()
                        .filter_map(|m| {
                            let name = m.get("name")?.as_str()?;
                            let lower = name.to_lowercase();
                            // Filter non-LLM models
                            if non_llm_patterns.iter().any(|p| lower.starts_with(p)) {
                                return None;
                            }
                            // Filter by suffix (before colon tag)
                            let base = lower.split(':').next().unwrap_or(&lower);
                            if non_llm_suffixes.iter().any(|s| base.ends_with(s)) {
                                return None;
                            }
                            Some(ModelInfo {
                                id: name.to_string(),
                                label: name.to_string(),
                            })
                        })
                        .collect();
                }
            }
        }
    }

    vec![]
}

/// Inner implementation for provider list.
/// Reads from ~/.claude/oh-my-claude/models-registry.json at runtime.
/// Filters to only show providers that are configured (API key set, OAuth stored, or localhost).
/// Falls back to a minimal default if the file is missing or malformed.
pub fn get_providers_inner() -> Vec<ProviderInfo> {
    if let Some(providers) = load_available_providers() {
        return providers;
    }
    // Minimal fallback when registry file is not available
    vec![
        ProviderInfo {
            name: "deepseek".to_string(),
            models: vec![
                ModelInfo { id: "deepseek-reasoner".to_string(), label: "DeepSeek Reasoner".to_string() },
                ModelInfo { id: "deepseek-chat".to_string(), label: "DeepSeek Chat".to_string() },
            ],
        },
    ]
}

/// Load provider list and filter to only configured (available) providers.
/// A provider is "configured" if:
/// - Its api_key_env environment variable is set, OR
/// - It's an OAuth provider with stored credentials (auth.json), OR
/// - Its base_url points to localhost (e.g., Ollama — no API key needed)
fn load_available_providers() -> Option<Vec<ProviderInfo>> {
    let home = dirs::home_dir()?;
    let registry_path = home
        .join(".claude")
        .join("oh-my-claude")
        .join("models-registry.json");
    let config_path = home
        .join(".claude")
        .join("oh-my-claude.json");
    let auth_path = home
        .join(".claude")
        .join("oh-my-claude")
        .join("auth.json");

    // Read models registry
    let registry_contents = fs::read_to_string(&registry_path).ok()?;
    let registry: serde_json::Value = serde_json::from_str(&registry_contents).ok()?;
    let providers_arr = registry.get("providers")?.as_array()?;

    // Read oh-my-claude.json config for provider details (api_key_env, type, base_url)
    let config: serde_json::Value = fs::read_to_string(&config_path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let config_providers = config.get("providers");

    // Read auth.json for OAuth credential checks
    let auth: serde_json::Value = fs::read_to_string(&auth_path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    let mut result = Vec::new();

    // First pass: collect configured providers for de-duplication
    let mut configured_set = std::collections::HashSet::new();
    for p in providers_arr {
        if let Some(name) = p.get("name").and_then(|n| n.as_str()) {
            let pc = config_providers.and_then(|ps| ps.get(name));
            if is_provider_configured(name, pc, &auth) {
                configured_set.insert(name.to_string());
            }
        }
    }

    // Provider family de-duplication: hide sibling when primary is configured
    // (e.g., hide zai when zhipu is configured — same models)
    let sibling_to_primary: std::collections::HashMap<&str, &str> = [
        ("zai", "zhipu"),
        ("minimax-cn", "minimax"),
    ].into_iter().collect();

    for p in providers_arr {
        let name = match p.get("name").and_then(|n| n.as_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        // Get provider config details
        let prov_config = config_providers
            .and_then(|ps| ps.get(&name));

        // Skip claude-subscription (not switchable via proxy)
        if let Some(pc) = prov_config {
            if pc.get("type").and_then(|t| t.as_str()) == Some("claude-subscription") {
                continue;
            }
        }

        // Check if provider is configured
        if !configured_set.contains(&name) {
            continue;
        }

        // De-duplicate: skip sibling when primary is configured
        if let Some(&primary) = sibling_to_primary.get(name.as_str()) {
            if configured_set.contains(primary) {
                continue;
            }
        }

        // Parse models
        let models_arr = p.get("models").and_then(|m| m.as_array());
        let models: Vec<ModelInfo> = models_arr
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        let id = m.get("id")?.as_str()?.to_string();
                        let label = m.get("label")?.as_str()?.to_string();
                        Some(ModelInfo { id, label })
                    })
                    .collect()
            })
            .unwrap_or_default();

        result.push(ProviderInfo { name, models });
    }

    Some(result)
}

/// Check if a provider is configured and available for use.
fn is_provider_configured(
    name: &str,
    prov_config: Option<&serde_json::Value>,
    auth: &serde_json::Value,
) -> bool {
    let Some(pc) = prov_config else {
        return false;
    };

    let prov_type = pc.get("type").and_then(|t| t.as_str()).unwrap_or("");

    // OAuth providers: check auth.json for stored credentials
    if prov_type == "openai-oauth" {
        return auth.get(name).is_some();
    }

    // API key providers: check if env var is set
    if let Some(env_var) = pc.get("api_key_env").and_then(|e| e.as_str()) {
        if std::env::var(env_var).map(|v| !v.is_empty()).unwrap_or(false) {
            return true;
        }

        // Provider family cross-check: CN/Global variants share API keys
        let sibling_key = match name {
            "zai" => Some("ZHIPU_API_KEY"),
            "zhipu" => Some("ZAI_API_KEY"),
            "minimax" => Some("MINIMAX_CN_API_KEY"),
            "minimax-cn" => Some("MINIMAX_API_KEY"),
            _ => None,
        };
        if let Some(sib) = sibling_key {
            if std::env::var(sib).map(|v| !v.is_empty()).unwrap_or(false) {
                return true;
            }
        }

        // Localhost providers (e.g., Ollama): configured even without API key
        if let Some(base_url) = pc.get("base_url").and_then(|u| u.as_str()) {
            if base_url.contains("localhost") || base_url.contains("127.0.0.1") {
                return true;
            }
        }

        return false;
    }

    false
}
