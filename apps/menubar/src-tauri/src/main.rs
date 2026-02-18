// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod proxy_client;
mod registry;
mod tray;
mod types;

use std::time::Duration;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::switch_model,
            commands::revert_model,
            commands::get_providers,
        ])
        .setup(|app| {
            // Hide from Dock on macOS — this is a menubar-only app
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Set up system tray
            tray::setup_tray(app)?;

            // Spawn background task to refresh tray every 2 seconds
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    let _ = tray::refresh_tray(&app_handle).await;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
