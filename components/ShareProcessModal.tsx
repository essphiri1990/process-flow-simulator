import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Link2, Loader2, Shield, Trash2, X } from 'lucide-react';
import { CanvasMetadata } from '../types';
import { getProcessBoxSdk } from '../processBoxSdk';
import { showToast } from './Toast';

interface ShareProcessModalProps {
  process: CanvasMetadata;
  onClose: () => void;
}

const formatTimestamp = (value: string | number | null | undefined): string => {
  if (!value) return 'Unknown';
  const parsed = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(parsed)) return 'Unknown';
  return new Date(parsed).toLocaleString();
};

const ShareProcessModal: React.FC<ShareProcessModalProps> = ({ process, onClose }) => {
  const sdk = getProcessBoxSdk();
  const canManageShares = Boolean(sdk?.isEmbedded && process.source === 'cloud' && process.snapshotId);
  const [shares, setShares] = useState<any[]>([]);
  const [shareTitle, setShareTitle] = useState(process.name);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const sortedShares = useMemo(
    () =>
      [...shares].sort(
        (left, right) => Date.parse(right?.createdAt || '') - Date.parse(left?.createdAt || ''),
      ),
    [shares],
  );

  const refreshShares = useCallback(async () => {
    if (!canManageShares || !sdk?.listSharedSims) {
      setStatus('ready');
      setError('Only saved cloud processes can be shared from Process Box.');
      return;
    }

    setStatus('loading');
    try {
      const payload = await sdk.listSharedSims({ workspaceId: process.id });
      setShares(Array.isArray(payload?.shares) ? payload.shares : []);
      setError(null);
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to load existing share links.');
    } finally {
      setStatus('ready');
    }
  }, [canManageShares, process.id, sdk]);

  useEffect(() => {
    void refreshShares();
  }, [refreshShares]);

  const copyLink = useCallback(async (shareUrl: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this browser.');
      }
      await navigator.clipboard.writeText(shareUrl);
      showToast('success', 'Share link copied.');
    } catch (nextError: any) {
      showToast('error', nextError?.message || 'Failed to copy the share link.');
    }
  }, []);

  const handleCreateShare = useCallback(async () => {
    if (!canManageShares || !sdk?.createSharedSim || !process.snapshotId) return;

    setBusyAction('create');
    try {
      const payload = await sdk.createSharedSim({
        saveId: process.snapshotId,
        title: shareTitle.trim() || process.name,
      });
      const nextShare = payload?.share;
      await refreshShares();
      if (nextShare?.shareUrl) {
        await copyLink(nextShare.shareUrl);
      }
      showToast('success', 'Read-only share link created.');
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to create the share link.');
    } finally {
      setBusyAction(null);
    }
  }, [canManageShares, copyLink, process.name, process.snapshotId, refreshShares, sdk, shareTitle]);

  const handleDeleteShare = useCallback(
    async (shareId: string) => {
      if (!sdk?.deleteSharedSim) return;
      setBusyAction(shareId);
      try {
        await sdk.deleteSharedSim(shareId);
        setShares((current) => current.filter((share) => share.id !== shareId));
        showToast('success', 'Share link revoked.');
      } catch (nextError: any) {
        setError(nextError?.message || 'Failed to revoke the share link.');
      } finally {
        setBusyAction(null);
      }
    },
    [sdk],
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/30 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border-2 border-slate-900 bg-white shadow-[6px_6px_0px_0px_rgba(15,23,42,0.9)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Share Process</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">{process.name}</div>
            <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Share a frozen, read-only snapshot. People with the link can run this simulation, but they cannot edit it or access anything else in your gallery.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            title="Close share dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-5 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Shield size={16} />
              Create Read-Only Link
            </div>
            <div className="mt-3 text-xs leading-5 text-slate-500">
              Each link points to the saved snapshot you selected. Later edits to the process do not change links that have already been created.
            </div>

            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Shared Title
            </label>
            <input
              type="text"
              value={shareTitle}
              onChange={(event) => setShareTitle(event.target.value)}
              disabled={!canManageShares || busyAction === 'create'}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100"
              maxLength={80}
            />

            <button
              type="button"
              onClick={() => void handleCreateShare()}
              disabled={!canManageShares || Boolean(busyAction)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border-2 border-slate-900 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,0.9)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'create' ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
              {busyAction === 'create' ? 'Creating...' : 'Create Share Link'}
            </button>

            {!canManageShares ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                Only saved cloud processes can be shared.
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Active Links</div>
                <div className="mt-1 text-xs text-slate-500">Manage existing read-only links for this process workspace.</div>
              </div>
              <button
                type="button"
                onClick={() => void refreshShares()}
                disabled={status === 'loading' || Boolean(busyAction)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {status === 'loading' ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Loading share links...
                </div>
              ) : sortedShares.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No share links have been created for this process yet.
                </div>
              ) : (
                sortedShares.map((share) => (
                  <div
                    key={share.id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-950">{share.title || 'Shared Process Simulation'}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Created {formatTimestamp(share.createdAt)} · Last opened {formatTimestamp(share.lastAccessedAt)}
                        </div>
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 break-all">
                          {share.shareUrl}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void copyLink(share.shareUrl)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <Copy size={13} />
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteShare(share.id)}
                          disabled={busyAction === share.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyAction === share.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          Revoke
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ShareProcessModal;
