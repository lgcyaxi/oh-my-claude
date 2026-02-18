use reqwest::Client;
use crate::types::{HealthResponse, StatusResponse, SwitchRequest, SwitchResponse};

/// HTTP client for communicating with per-session proxy control APIs
pub struct ProxyClient {
    client: Client,
}

impl ProxyClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .expect("Failed to build HTTP client"),
        }
    }

    /// GET /health on a control port
    pub async fn get_health(&self, control_port: u16) -> Result<HealthResponse, String> {
        let url = format!("http://localhost:{}/health", control_port);
        let resp = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
        resp.json().await.map_err(|e| e.to_string())
    }

    /// GET /status?session=ID on a control port
    pub async fn get_status(&self, control_port: u16, session_id: &str) -> Result<StatusResponse, String> {
        let url = format!("http://localhost:{}/status?session={}", control_port, session_id);
        let resp = self.client.get(&url).send().await.map_err(|e| e.to_string())?;
        resp.json().await.map_err(|e| e.to_string())
    }

    /// POST /switch?session=ID on a control port
    pub async fn switch_model(
        &self,
        control_port: u16,
        session_id: &str,
        provider: &str,
        model: &str,
    ) -> Result<SwitchResponse, String> {
        let url = format!("http://localhost:{}/switch?session={}", control_port, session_id);
        let body = SwitchRequest {
            provider: provider.to_string(),
            model: model.to_string(),
        };
        let resp = self.client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;
        resp.json().await.map_err(|e| e.to_string())
    }

    /// POST /revert?session=ID on a control port
    pub async fn revert_model(
        &self,
        control_port: u16,
        session_id: &str,
    ) -> Result<SwitchResponse, String> {
        let url = format!("http://localhost:{}/revert?session={}", control_port, session_id);
        let resp = self.client.post(&url).send().await.map_err(|e| e.to_string())?;
        resp.json().await.map_err(|e| e.to_string())
    }
}
