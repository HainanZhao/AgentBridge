import { BaseCliAgent, type CliAgentCapabilities } from './BaseCliAgent.js';

/**
 * OpenCode CLI agent implementation.
 * Supports OpenCode with ACP (Agent Communication Protocol).
 */
export class OpencodeAgent extends BaseCliAgent {
  getCommand(): string {
    return this.config.command;
  }

  buildAcpArgs(): string[] {
    return ['acp'];
  }

  getDisplayName(): string {
    return 'OpenCode';
  }

  getCapabilities(): CliAgentCapabilities {
    return {
      supportsAcp: true,
      supportsApprovalMode: true,
      supportsModelSelection: true,
      supportsIncludeDirectories: true,
    };
  }
}
