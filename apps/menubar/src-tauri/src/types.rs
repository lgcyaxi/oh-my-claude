use serde::{Deserialize, Serialize};

/// A proxy session entry from proxy-sessions.json
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxySessionEntry {
    pub session_id: String,
    pub port: u16,
    pub control_port: u16,
    pub pid: u32,
    pub started_at: u64,
    pub cwd: Option<String>,
}

/// Session info returned to the frontend (enriched with live status)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    pub port: u16,
    pub control_port: u16,
    pub pid: u32,
    pub started_at: u64,
    pub cwd: Option<String>,
    pub project_name: String,
    pub switched: bool,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub healthy: bool,
}

/// Health response from proxy control API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub uptime: Option<u64>,
    pub uptime_human: Option<String>,
    pub request_count: Option<u64>,
    pub active_sessions: Option<u32>,
}

/// Status response from proxy control API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResponse {
    pub switched: bool,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub switched_at: Option<u64>,
    pub session_id: Option<String>,
}

/// Switch request body
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwitchRequest {
    pub provider: String,
    pub model: String,
}

/// Switch/revert response from proxy control API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchResponse {
    pub switched: bool,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub session_id: Option<String>,
    pub message: Option<String>,
    pub warning: Option<String>,
}

/// Provider info for the model picker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub name: String,
    pub models: Vec<ModelInfo>,
}

/// Model info within a provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
}
