use std::process::Command;

/// Load environment variables from the user's login shell.
///
/// macOS GUI apps (launched from Finder, Spotlight, or launchd) do NOT inherit
/// shell profile environment variables (.zshrc, .bashrc, etc.). This function
/// spawns a login shell, prints its environment, and injects the variables into
/// the current process so that `std::env::var()` works as expected.
pub fn load_shell_env() {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    // Spawn a login shell that prints all env vars in null-delimited format.
    // Using -l (login) + -i (interactive) ensures .zshrc/.bashrc and their
    // sourced files (like .zshrc.api) are fully loaded.
    // The null delimiter avoids issues with multi-line env values.
    let output = Command::new(&shell)
        .args(["-l", "-i", "-c", "env -0"])
        .output();

    let output = match output {
        Ok(o) if o.status.success() => o,
        Ok(o) => {
            // Fallback: try non-interactive login shell (avoids prompt issues)
            eprintln!(
                "shell_env: interactive shell failed ({}), trying login-only",
                o.status
            );
            match Command::new(&shell).args(["-l", "-c", "env -0"]).output() {
                Ok(o2) if o2.status.success() => o2,
                _ => {
                    eprintln!("shell_env: could not load shell environment");
                    return;
                }
            }
        }
        Err(e) => {
            eprintln!("shell_env: failed to spawn shell: {}", e);
            return;
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut count = 0;

    for entry in stdout.split('\0') {
        if let Some((key, value)) = entry.split_once('=') {
            // Skip empty keys and internal shell vars
            if key.is_empty() || key.starts_with('_') {
                continue;
            }
            std::env::set_var(key, value);
            count += 1;
        }
    }

    eprintln!("shell_env: loaded {} environment variables from {}", count, shell);
}
