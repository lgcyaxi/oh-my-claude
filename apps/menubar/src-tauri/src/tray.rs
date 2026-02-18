use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, Submenu},
    tray::TrayIconBuilder,
    App,
};

use crate::proxy_client::ProxyClient;

/// Embedded tray icon (22x22 PNG, compiled into binary)
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/tray-idle.png");

/// Monotonic counter to ensure unique menu item IDs across refresh cycles.
/// Tauri 2 registers menu items globally by ID — reusing IDs across different
/// Menu instances causes use-after-free in the native menu backend (macOS AppKit).
static MENU_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Cached fingerprint of the last menu state. When session data hasn't changed,
/// we skip `set_menu` to avoid closing a menu the user is browsing.
static LAST_MENU_FINGERPRINT: Mutex<String> = Mutex::new(String::new());

/// Set up the system tray with an initial empty menu
pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_empty_menu(app)?;

    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(TRAY_ICON_BYTES)?)
        .icon_as_template(true)
        .tooltip("oh-my-claude")
        .menu(&menu)
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            handle_menu_event(app, id);
        })
        .build(app)?;

    Ok(())
}

/// Generate a unique menu item ID by appending a monotonic counter.
/// This prevents Tauri 2 from reusing stale native menu item references.
fn uid(base: &str) -> String {
    let n = MENU_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}_{}", base, n)
}

fn build_empty_menu(app: &App) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let menu = Menu::new(app)?;
    let header = MenuItem::with_id(app, &uid("header"), "oh-my-claude", false, None::<&str>)?;
    let no_sessions = MenuItem::with_id(app, &uid("no_sessions"), "No sessions running", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, &uid("quit"), "Quit", true, None::<&str>)?;

    menu.append(&header)?;
    menu.append(&no_sessions)?;
    menu.append(&quit)?;

    Ok(menu)
}

/// Handle tray menu item clicks.
/// Menu IDs have a `_N` counter suffix for uniqueness — strip it for matching.
fn handle_menu_event(app: &tauri::AppHandle, id: &str) {
    if id.starts_with("quit_") {
        app.exit(0);
        return;
    }

    if id.starts_with("switch:") || id.starts_with("revert:") {
        let app_handle = app.clone();
        let id_owned = id.to_string();
        tauri::async_runtime::spawn(async move {
            handle_action(&app_handle, &id_owned).await;
        });
    }
}

/// Execute a switch or revert action from a menu click.
/// IDs use format `action:field1:field2:...:fieldN_COUNTER` — strip the trailing `_N`.
async fn handle_action(app: &tauri::AppHandle, id: &str) {
    // Strip the _N counter suffix from the last segment
    let id = strip_counter_suffix(id);
    let client = ProxyClient::new();
    let parts: Vec<&str> = id.split(':').collect();

    match parts[0] {
        "switch" if parts.len() >= 5 => {
            let control_port: u16 = parts[1].parse().unwrap_or(0);
            let session_id = parts[2];
            let provider = parts[3];
            let model = parts[4];
                match client.switch_model(control_port, session_id, provider, model).await {
                Ok(_) => { let _ = refresh_tray(app).await; }
                Err(e) => eprintln!("[tray] Switch error: {}", e),
            }
        }
        "revert" if parts.len() >= 3 => {
            let control_port: u16 = parts[1].parse().unwrap_or(0);
            let session_id = parts[2];

            match client.revert_model(control_port, session_id).await {
                Ok(_) => { let _ = refresh_tray(app).await; }
                Err(e) => eprintln!("[tray] Revert error: {}", e),
            }
        }
        _ => {}
    }
}

/// Strip the `_N` counter suffix from a menu item ID.
/// e.g. `"switch:9000:abc:deepseek:chat:-1_42"` → `"switch:9000:abc:deepseek:chat:-1"`
fn strip_counter_suffix(id: &str) -> String {
    if let Some(pos) = id.rfind('_') {
        if id[pos + 1..].chars().all(|c| c.is_ascii_digit()) {
            return id[..pos].to_string();
        }
    }
    id.to_string()
}

/// Build a fingerprint of the current session state for change detection.
/// Only rebuilds the menu when this fingerprint differs from the last one.
fn compute_fingerprint(sessions: &[crate::types::SessionInfo]) -> String {
    use std::fmt::Write;
    let mut fp = String::new();
    for s in sessions {
        let _ = write!(
            fp,
            "{}:{}:{}:{}:{}|",
            s.session_id,
            s.healthy,
            s.switched,
            s.provider.as_deref().unwrap_or(""),
            s.model.as_deref().unwrap_or(""),
        );
    }
    fp
}

/// Refresh the tray menu with current session state.
/// Skips the rebuild if session data hasn't changed, preventing the menu
/// from closing while the user is browsing submenus.
pub async fn refresh_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let sessions = crate::commands::list_sessions_inner().await;

    // Skip rebuild if nothing changed
    let fingerprint = compute_fingerprint(&sessions);
    {
        let mut last = LAST_MENU_FINGERPRINT.lock().unwrap();
        if *last == fingerprint {
            return Ok(());
        }
        *last = fingerprint;
    }

    let tray = app.tray_by_id("main").ok_or("Tray not found")?;

    let menu = Menu::new(app).map_err(|e| e.to_string())?;
    let header = MenuItem::with_id(app, &uid("header"), "oh-my-claude", false, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&header).map_err(|e| e.to_string())?;

    if sessions.is_empty() {
        let no_sessions = MenuItem::with_id(app, &uid("no_sessions"), "No sessions running", false, None::<&str>)
            .map_err(|e| e.to_string())?;
        menu.append(&no_sessions).map_err(|e| e.to_string())?;
    } else {
        for session in &sessions {
            let current_model = if session.switched {
                format!(
                    "{}/{}",
                    session.provider.as_deref().unwrap_or("?"),
                    session.model.as_deref().unwrap_or("?"),
                )
            } else {
                "Claude (native)".to_string()
            };

            let session_label = format!(
                "{} - {}",
                &session.session_id[..session.session_id.len().min(8)],
                current_model
            );

            // Create submenu for this session — each needs a unique ID
            let submenu = Submenu::with_id(
                app,
                &uid(&format!("session_{}", session.session_id)),
                &session_label,
                true,
            )
            .map_err(|e| e.to_string())?;

            // Add model switch options
            let providers = crate::commands::get_providers_inner();
            for provider in &providers {
                for model in &provider.models {
                    let action = format!(
                        "switch:{}:{}:{}:{}",
                        session.control_port, session.session_id, provider.name, model.id
                    );
                    let label = format!("{} / {}", provider.name, model.label);
                    let item = MenuItem::with_id(app, &uid(&action), &label, true, None::<&str>)
                        .map_err(|e| e.to_string())?;
                    submenu.append(&item).map_err(|e| e.to_string())?;
                }
            }

            // Add revert option if switched
            if session.switched {
                let action = format!("revert:{}:{}", session.control_port, session.session_id);
                let revert = MenuItem::with_id(app, &uid(&action), "Revert to Claude", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                submenu.append(&revert).map_err(|e| e.to_string())?;
            }

            menu.append(&submenu).map_err(|e| e.to_string())?;
        }
    }

    let quit = MenuItem::with_id(app, &uid("quit"), "Quit", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&quit).map_err(|e| e.to_string())?;

    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    Ok(())
}
