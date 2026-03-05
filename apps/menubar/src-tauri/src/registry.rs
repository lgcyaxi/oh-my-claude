use std::fs;
use std::net::TcpStream;
use std::path::PathBuf;
use std::time::Duration;

use crate::types::ProxySessionEntry;

/// Get the path to proxy-sessions.json
fn registry_path() -> PathBuf {
    let home = dirs::home_dir().expect("Cannot determine home directory");
    home.join(".claude")
        .join("oh-my-claude")
        .join("proxy-sessions.json")
}

#[cfg(unix)]
fn is_pid_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[cfg(windows)]
fn is_pid_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle == 0 {
            return false;
        }
        CloseHandle(handle);
        true
    }
}

/// Check if a proxy control port is reachable (for WSL2 sessions where PID check doesn't work).
/// Tries IPv4 first, then IPv6 — WSL2's Bun may bind to [::1] instead of 127.0.0.1.
fn is_control_port_alive(control_port: u16) -> bool {
    let timeout = Duration::from_millis(500);
    // Try IPv4
    if TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", control_port).parse().unwrap(),
        timeout,
    )
    .is_ok()
    {
        return true;
    }
    // Try IPv6
    TcpStream::connect_timeout(
        &format!("[::1]:{}", control_port).parse().unwrap(),
        timeout,
    )
    .is_ok()
}

/// Read all proxy session entries, filtering out dead PIDs
pub fn read_registry() -> Vec<ProxySessionEntry> {
    let path = registry_path();
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let entries: Vec<ProxySessionEntry> = match serde_json::from_str(&content) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    // Filter to only alive sessions
    entries
        .into_iter()
        .filter(|e| {
            if e.source.as_deref() == Some("wsl2") {
                // WSL2 PIDs aren't visible in Windows — check control port instead
                is_control_port_alive(e.control_port)
            } else {
                is_pid_alive(e.pid)
            }
        })
        .collect()
}
