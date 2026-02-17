import { BaseCliAgent, type CliAgentCapabilities, type CliAgentConfig } from './BaseCliAgent.js';

/**
 * OpenCode CLI agent implementation.
 * Supports OpenCode with ACP (Agent Communication Protocol).
 */
export class OpencodeAgent extends BaseCliAgent {
  constructor(config: CliAgentConfig) {
    super(config);
  }

  getCommand(): string {
    return this.config.command;
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
