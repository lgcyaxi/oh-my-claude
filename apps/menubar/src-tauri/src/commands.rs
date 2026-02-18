use crate::proxy_client::ProxyClient;
use crate::registry::read_registry;
use crate::types::{ModelInfo, ProviderInfo, SessionInfo, SwitchResponse};

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

/// Get available providers and their models
#[tauri::command]
pub fn get_providers() -> Vec<ProviderInfo> {
    get_providers_inner()
}

/// Inner implementation for provider list
pub fn get_providers_inner() -> Vec<ProviderInfo> {
    // Hardcoded provider/model list matching oh-my-claude config schema
    // In future, read from ~/.claude/oh-my-claude.json
    vec![
        ProviderInfo {
            name: "deepseek".to_string(),
            models: vec![
                ModelInfo { id: "deepseek-reasoner".to_string(), label: "DeepSeek Reasoner".to_string() },
                ModelInfo { id: "deepseek-chat".to_string(), label: "DeepSeek Chat".to_string() },
            ],
        },
        ProviderInfo {
            name: "zhipu".to_string(),
            models: vec![
                ModelInfo { id: "GLM-5".to_string(), label: "ZhiPu GLM-5".to_string() },
                ModelInfo { id: "glm-4v-flash".to_string(), label: "ZhiPu GLM-4V Flash".to_string() },
            ],
        },
        ProviderInfo {
            name: "minimax".to_string(),
            models: vec![
                ModelInfo { id: "MiniMax-M2.5".to_string(), label: "MiniMax M2.5".to_string() },
            ],
        },
        ProviderInfo {
            name: "kimi".to_string(),
            models: vec![
                ModelInfo { id: "K2.5".to_string(), label: "Kimi K2.5".to_string() },
            ],
        },
        ProviderInfo {
            name: "openai".to_string(),
            models: vec![
                ModelInfo { id: "gpt-5.3-codex".to_string(), label: "GPT-5.3 Codex".to_string() },
            ],
        },
    ]
}
