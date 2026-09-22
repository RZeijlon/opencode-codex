/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi } from '@opencode-ai/plugin/tui';
import * as accounts from '../accounts/index.js';
import * as selection from '../accounts/selection.js';
import * as quota from '../quota/index.js';
import { activeNow } from './refresh.js';

export function showAccounts(api: TuiPluginApi): void {
  const dialog = api.ui.dialog;
  void accounts.load().then((store) => {
    if (store.accounts.length === 0) {
      dialog.replace(() => (
        <api.ui.DialogAlert
          title="Codex accounts"
          message="No accounts yet. Use /connect → openai to add one."
          onConfirm={() => dialog.clear()}
        />
      ));
      return;
    }
    const activeId = selection.active(store)?.id;
    dialog.replace(() => (
      <api.ui.DialogSelect
        title="Switch Codex account"
        current={activeId}
        options={store.accounts.map((account) => {
          const status: string[] = [];
          const plan = quota.plan(account);
          const window5h = account.usage?.windows.find(
            (w) => w.windowMinutes <= 600,
          );
          if (window5h) {
            const left = quota.left(window5h.usedPercent);
            if (left != null) status.push(`5h ${Math.round(left)}%`);
          }
          return {
            title: `${account.email || account.label || 'Unknown email'} · ${
              plan || 'Plan unknown'
            }`,
            value: account.id,
            description: status.join(' · ') || undefined,
          };
        })}
        onSelect={async (option) => {
          if (typeof option.value !== 'string') return;
          if (option.value !== activeId) {
            selection.select(option.value);
            void activeNow();
          }
          dialog.clear();
        }}
      />
    ));
  });
}
