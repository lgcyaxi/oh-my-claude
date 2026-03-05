/**
 * Re-export from pane/ subfolder for backward compatibility.
 * All pane-based polling logic now lives in pane/poll-response.ts.
 */
export {
  pollForBridgeResponse,
  pollCCPaneResponse,
  pollProxyResponse,
  type PaneMonitorOptions,
} from "./pane/poll-response";
