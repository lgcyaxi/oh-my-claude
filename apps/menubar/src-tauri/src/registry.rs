use std::fs;
use std::path::PathBuf;

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

    // Filter to only alive PIDs
    entries
        .into_iter()
        .filter(|e| is_pid_alive(e.pid))
        .collect()
}
