import fs from 'node:fs';
import path from 'node:path';
import blessed from 'blessed';

type ConfigValue = string | number | boolean | string[];

type ConfigField = {
  key: string;
  label: string;
  description: string;
  valueType: 'string' | 'number' | 'boolean' | 'stringArray' | 'enum';
  enumValues?: string[];
  isRequired: (config: Record<string, unknown>) => boolean;
  isVisible: (config: Record<string, unknown>) => boolean;
  order: number;
};

const CONFIG_FIELDS: ConfigField[] = [
  {
    key: 'messagingPlatform',
    label: 'messagingPlatform',
    description: 'Active platform adapter. Controls which platform-specific keys are shown.',
    valueType: 'enum',
    enumValues: ['telegram', 'slack'],
    isRequired: () => true,
    isVisible: () => true,
    order: 1,
  },
  {
    key: 'telegramToken',
    label: 'telegramToken',
    description: 'Telegram bot token from BotFather.',
    valueType: 'string',
    isRequired: (config) => String(config.messagingPlatform || 'telegram') === 'telegram',
    isVisible: (config) => String(config.messagingPlatform || 'telegram') === 'telegram',
    order: 2,
  },
  {
    key: 'telegramWhitelist',
    label: 'telegramWhitelist',
    description: 'Comma-separated Telegram usernames (without @).',
    valueType: 'stringArray',
    isRequired: (config) => String(config.messagingPlatform || 'telegram') === 'telegram',
    isVisible: (config) => String(config.messagingPlatform || 'telegram') === 'telegram',
    order: 3,
  },
  {
    key: 'slackBotToken',
    label: 'slackBotToken',
    description: 'Slack bot token (xoxb-...).',
    valueType: 'string',
    isRequired: (config) => String(config.messagingPlatform || 'telegram') === 'slack',
    isVisible: (config) => String(config.messagingPlatform || 'telegram') === 'slack',
    order: 4,
  },
  {
    key: 'slackSigningSecret',
    label: 'slackSigningSecret',
    description: 'Slack signing secret.',
    valueType: 'string',
    isRequired: (config) => String(config.messagingPlatform || 'telegram') === 'slack',
    isVisible: (config) => String(config.messagingPlatform || 'telegram') === 'slack',
    order: 5,
  },
  {
    key: 'slackWhitelist',
    label: 'slackWhitelist',
    description: 'Comma-separated Slack user IDs or emails.',
    valueType: 'stringArray',
    isRequired: (config) => String(config.messagingPlatform || 'telegram') === 'slack',
    isVisible: (config) => String(config.messagingPlatform || 'telegram') === 'slack',
    order: 6,
  },
  {
    key: 'slackAppToken',
    label: 'slackAppToken',
    description: 'Optional Slack Socket Mode app token.',
    valueType: 'string',
    isRequired: () => false,
    isVisible: (config) => String(config.messagingPlatform || 'telegram') === 'slack',
    order: 7,
  },
  {
    key: 'geminiApprovalMode',
    label: 'geminiApprovalMode',
    description: 'Gemini approval behavior for tool/edit actions.',
    valueType: 'enum',
    enumValues: ['default', 'auto_edit', 'yolo', 'plan'],
    isRequired: () => false,
    isVisible: () => true,
    order: 20,
  },
  {
    key: 'acpPermissionStrategy',
    label: 'acpPermissionStrategy',
    description: 'How ACP permission prompts are auto-selected.',
    valueType: 'enum',
    enumValues: ['allow_once', 'reject_once', 'cancelled'],
    isRequired: () => false,
    isVisible: () => true,
    order: 21,
  },
  {
    key: 'timezone',
    label: 'timezone',
    description: 'Scheduler timezone (IANA TZ name).',
    valueType: 'string',
    isRequired: () => false,
    isVisible: () => true,
    order: 22,
  },
  {
    key: 'typingIntervalMs',
    label: 'typingIntervalMs',
    description: 'Typing indicator refresh interval in ms.',
    valueType: 'number',
    isRequired: () => false,
    isVisible: () => true,
    order: 23,
  },
  {
    key: 'streamUpdateIntervalMs',
    label: 'streamUpdateIntervalMs',
    description: 'Minimum interval between live stream updates in ms.',
    valueType: 'number',
    isRequired: () => false,
    isVisible: () => true,
    order: 24,
  },
  {
    key: 'maxResponseLength',
    label: 'maxResponseLength',
    description: 'Maximum response length in characters.',
    valueType: 'number',
    isRequired: () => false,
    isVisible: () => true,
    order: 25,
  },
  {
    key: 'callbackAuthToken',
    label: 'callbackAuthToken',
    description: 'Optional token for callback/API authentication.',
    valueType: 'string',
    isRequired: () => false,
    isVisible: () => true,
    order: 26,
  },
];

function formatFieldValue(value: unknown, field: ConfigField): string {
  if (field.valueType === 'stringArray') {
    return Array.isArray(value) ? value.join(', ') : '';
  }
  if (field.valueType === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function parseFieldValue(input: string, field: ConfigField): ConfigValue {
  if (field.valueType === 'number') {
    const parsed = Number.parseInt(input.trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (field.valueType === 'boolean') {
    return input.trim().toLowerCase() === 'true';
  }
  if (field.valueType === 'stringArray') {
    return input
      .split(',')
      .map((item) => item.trim().replace(/^@/, ''))
      .filter(Boolean);
  }
  return input;
}

function validateRequiredFields(config: Record<string, unknown>) {
  const missing: string[] = [];

  for (const field of CONFIG_FIELDS) {
    if (!field.isVisible(config) || !field.isRequired(config)) {
      continue;
    }

    const value = config[field.key];
    if (field.valueType === 'stringArray') {
      if (!Array.isArray(value) || value.length === 0) {
        missing.push(field.label);
      }
      continue;
    }

    const text = String(value ?? '').trim();
    if (!text) {
      missing.push(field.label);
    }
  }

  if (String(config.messagingPlatform || 'telegram') === 'telegram') {
    const token = String(config.telegramToken || '').trim();
    if (!token.includes(':') && !missing.includes('telegramToken')) {
      missing.push('telegramToken');
    }
  }

  return missing;
}

function getVisibleFields(config: Record<string, unknown>): ConfigField[] {
  return CONFIG_FIELDS.filter((field) => field.isVisible(config)).sort((left, right) => {
    const leftRequired = left.isRequired(config) ? 0 : 1;
    const rightRequired = right.isRequired(config) ? 0 : 1;
    if (leftRequired !== rightRequired) {
      return leftRequired - rightRequired;
    }
    return left.order - right.order;
  });
}

function truncateText(text: string, width: number): string {
  if (text.length <= width) {
    return text;
  }
  if (width <= 1) {
    return text.slice(0, 1);
  }
  return `${text.slice(0, width - 1)}…`;
}

function cycleEnum(field: ConfigField, current: string, direction: 1 | -1): string {
  const values = field.enumValues || [];
  if (values.length === 0) {
    return current;
  }
  const index = Math.max(0, values.indexOf(current));
  const nextIndex = (index + direction + values.length) % values.length;
  return values[nextIndex];
}

export type TuiResult = {
  saved: boolean;
};

export async function runConfigTui(
  configPath: string,
  defaultConfigTemplate: Record<string, unknown>,
  resolveConfigPath: (configPath: string) => string,
): Promise<TuiResult> {
  const absolutePath = resolveConfigPath(configPath);
  const existingConfig = fs.existsSync(absolutePath)
    ? (JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as Record<string, unknown>)
    : {};

  const baseConfig = {
    ...defaultConfigTemplate,
    ...existingConfig,
  } as Record<string, unknown>;

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Clawless Config TUI',
  });

  blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { fg: 'black', bg: 'cyan' },
    content: ' ↑/↓ move  Enter edit  ←/→ enum  s save  q quit ',
  });

  blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: 1,
    style: { fg: 'white', bg: 'blue' },
    content: ` Target: ${absolutePath}`,
  });

  const keysList = blessed.list({
    parent: screen,
    top: 2,
    left: 0,
    width: '45%',
    height: '100%-4',
    border: 'line',
    label: ' Keys ',
    keys: false,
    vi: false,
    mouse: true,
    style: {
      selected: { bg: 'blue', fg: 'white', bold: true },
      item: { fg: 'white' },
      border: { fg: 'gray' },
    },
    scrollbar: {
      ch: ' ',
    },
  });

  const detailsBox = blessed.box({
    parent: screen,
    top: 2,
    left: '45%',
    width: '55%',
    height: '100%-4',
    border: 'line',
    label: ' Value ',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    style: {
      fg: 'white',
      border: { fg: 'gray' },
    },
  });

  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    style: { fg: 'white', bg: 'magenta' },
    content: ' Ready ',
  });

  const prompt = blessed.prompt({
    parent: screen,
    border: 'line',
    height: 9,
    width: '70%',
    top: 'center',
    left: 'center',
    label: ' Edit Value ',
    tags: true,
    keys: true,
    vi: true,
    hidden: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' },
    },
  });

  let visibleFields = getVisibleFields(baseConfig);
  let selectedIndex = 0;
  let saved = false;
  let finished = false;

  const setStatus = (text: string) => {
    statusBar.setContent(` ${text}`);
  };

  const getSelectedField = () => visibleFields[selectedIndex];

  const renderList = () => {
    visibleFields = getVisibleFields(baseConfig);
    if (selectedIndex >= visibleFields.length) {
      selectedIndex = Math.max(0, visibleFields.length - 1);
    }

    const width = Math.max(20, keysList.width as number);
    const lineWidth = width - 6;

    const items = visibleFields.map((field, index) => {
      const marker = index === selectedIndex ? '›' : ' ';
      const required = field.isRequired(baseConfig) ? '*' : ' ';
      const value = formatFieldValue(baseConfig[field.key], field);
      const preview = value ? ` = ${value.replace(/\s+/g, ' ')}` : '';
      return truncateText(`${marker} ${required} ${field.label}${preview}`, lineWidth);
    });

    keysList.setItems(items);
    keysList.select(selectedIndex);
  };

  const renderDetails = () => {
    const field = getSelectedField();
    if (!field) {
      detailsBox.setContent('No fields available');
      return;
    }

    const value = formatFieldValue(baseConfig[field.key], field);
    const required = field.isRequired(baseConfig) ? 'yes' : 'no';

    let interactionHint = 'Enter to edit';
    if (field.valueType === 'enum') {
      interactionHint = `Enum: ←/→ or Enter (${(field.enumValues || []).join(', ')})`;
    } else if (field.valueType === 'boolean') {
      interactionHint = 'Toggle: Enter';
    } else if (field.valueType === 'stringArray') {
      interactionHint = 'Edit: Enter (comma-separated values)';
    }

    const missing = validateRequiredFields(baseConfig);
    const summary = missing.length > 0 ? `Missing required: ${missing.join(', ')}` : 'All required fields set';

    detailsBox.setContent(
      [
        `{bold}Key:{/bold} ${field.label}`,
        `{bold}Required:{/bold} ${required}`,
        `{bold}Value:{/bold} ${value || '(empty)'}`,
        '',
        `{bold}How to edit:{/bold} ${interactionHint}`,
        `{bold}About:{/bold} ${field.description}`,
        '',
        `{bold}Validation:{/bold} ${summary}`,
      ].join('\n'),
    );
  };

  const renderAll = () => {
    renderList();
    renderDetails();
    screen.render();
  };

  const saveConfig = () => {
    const missing = validateRequiredFields(baseConfig);
    if (missing.length > 0) {
      setStatus(`Cannot save. Missing required: ${missing.join(', ')}`);
      renderAll();
      return;
    }

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, `${JSON.stringify(baseConfig, null, 2)}\n`, 'utf8');
    saved = true;
    setStatus(`Saved config: ${absolutePath}`);
    screen.render();
    setTimeout(() => {
      if (!finished) {
        finished = true;
        screen.destroy();
      }
    }, 120);
  };

  const editField = (field: ConfigField) => {
    if (field.valueType === 'enum') {
      const current = String(baseConfig[field.key] || '');
      const next = cycleEnum(field, current, 1);
      baseConfig[field.key] = next;
      setStatus(`Set ${field.label} = ${next}`);
      renderAll();
      return;
    }

    if (field.valueType === 'boolean') {
      const next = !baseConfig[field.key];
      baseConfig[field.key] = next;
      setStatus(`Set ${field.label} = ${String(next)}`);
      renderAll();
      return;
    }

    const currentValue = formatFieldValue(baseConfig[field.key], field);

    prompt.input(`Edit ${field.label}`, currentValue, (_error, value) => {
      if (typeof value === 'string') {
        baseConfig[field.key] = parseFieldValue(value, field);
        setStatus(`Updated ${field.label}`);
      } else {
        setStatus(`Canceled edit for ${field.label}`);
      }
      keysList.focus();
      renderAll();
    });
  };

  const moveSelection = (delta: number) => {
    if (visibleFields.length === 0) {
      return;
    }
    selectedIndex = Math.max(0, Math.min(visibleFields.length - 1, selectedIndex + delta));
    renderAll();
  };

  const cycleSelectedEnum = (direction: 1 | -1) => {
    const field = getSelectedField();
    if (!field || field.valueType !== 'enum') {
      return;
    }
    const current = String(baseConfig[field.key] || '');
    const next = cycleEnum(field, current, direction);
    baseConfig[field.key] = next;
    setStatus(`Set ${field.label} = ${next}`);
    renderAll();
  };

  keysList.on('select', (_item, index) => {
    selectedIndex = index;
    renderAll();
  });

  screen.key(['up'], () => moveSelection(-1));
  screen.key(['down'], () => moveSelection(1));
  screen.key(['left'], () => cycleSelectedEnum(-1));
  screen.key(['right'], () => cycleSelectedEnum(1));

  screen.key(['enter'], () => {
    const field = getSelectedField();
    if (!field) {
      return;
    }
    editField(field);
  });

  screen.key(['s', 'S'], () => saveConfig());
  screen.key(['q', 'Q', 'C-c'], () => {
    if (!finished) {
      finished = true;
      screen.destroy();
    }
  });

  keysList.focus();
  renderAll();

  return await new Promise<TuiResult>((resolve) => {
    screen.on('destroy', () => {
      resolve({ saved });
    });
  });
}
