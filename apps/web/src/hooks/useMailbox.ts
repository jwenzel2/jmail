import type {
  FolderRole,
  MailFolder,
  MessageDetail,
  MessageListFilter,
  MessageListSort,
} from '@jmail/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as mailApi from '../api/mail';
import { EMPTY_DRAFT, type ComposeDraft } from '../components/ComposeModal';
import type { RowAction } from '../components/MessageList';
import { formatAddressFull, formatFullDate } from '../utils/format';
import { openMessagePopup } from '../utils/windows';
import {
  useFolders,
  useMailEvents,
  useMessage,
  useMessageAction,
  useMessages,
  useSearch,
} from './useMail';
import { useMailPageSize } from './useMailSettings';

function quote(m: MessageDetail): string {
  const intro = `On ${formatFullDate(m.date)}, ${m.from.map(formatAddressFull).join(', ')} wrote:`;
  const quoted = (m.text ?? '')
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
  return `\n\n${intro}\n${quoted}`;
}

function replyDraft(m: MessageDetail): ComposeDraft {
  return {
    to: m.replyTo.length
      ? m.replyTo.map((a) => a.address).join(', ')
      : m.from.map((a) => a.address).join(', '),
    cc: '',
    subject: m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`,
    body: quote(m),
    inReplyToUid: m.uid,
    inReplyToFolder: m.folder,
  };
}

function forwardDraft(m: MessageDetail): ComposeDraft {
  return {
    ...EMPTY_DRAFT,
    subject: m.subject.startsWith('Fwd:') ? m.subject : `Fwd: ${m.subject}`,
    body: `\n\n---------- Forwarded message ----------${quote(m)}`,
  };
}

/**
 * Centralizes all mailbox state and actions (folder/search/filter/sort/paging,
 * reading, compose, single-message + bulk actions, and multi-select). Shared by
 * the desktop and mobile mailbox shells so both behave identically.
 */
export function useMailbox() {
  const [params, setParams] = useSearchParams();
  const [folder, setFolder] = useState('INBOX');
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MessageListFilter>('all');
  const [sort, setSort] = useState<MessageListSort>('dateDesc');
  const [page, setPage] = useState(1);
  const [compose, setCompose] = useState<{ opened: boolean; draft: ComposeDraft }>({
    opened: false,
    draft: EMPTY_DRAFT,
  });

  // Multi-select. `allMatching` marks that selection spans every matching
  // message in the folder (not just the current page), so the "select all"
  // banner can offer it and reflect it.
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [allMatching, setAllMatching] = useState(false);

  const [pageSize] = useMailPageSize();
  const qc = useQueryClient();
  useMailEvents();
  const folders = useFolders();
  const browse = useMessages(folder, page, pageSize, filter, sort);
  const searching = useSearch(folder, search, page, pageSize, filter, sort);
  const active = search.trim() ? searching : browse;
  const message = useMessage(selectedUid !== null ? folder : null, selectedUid);
  const action = useMessageAction();

  const messages = useMemo(() => active.data?.messages ?? [], [active.data?.messages]);
  const total = active.data?.total ?? 0;

  // Apply a ?compose=<addr> query param (e.g. mailto links) once.
  useEffect(() => {
    const recipient = params.get('compose');
    if (!recipient) return;
    setCompose({ opened: true, draft: { ...EMPTY_DRAFT, to: recipient } });
    setParams({}, { replace: true });
  }, [params, setParams]);

  // Refresh unread counts after a message is opened (server marks it \Seen).
  useEffect(() => {
    if (message.data) {
      void qc.invalidateQueries({ queryKey: ['folders'] });
      void qc.invalidateQueries({ queryKey: ['messages'] });
    }
  }, [message.data?.uid, message.data?.folder, qc, message.data]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  // Clamp page if the total shrank below the current page.
  useEffect(() => {
    if (active.data?.total === undefined) return;
    const maxPage = Math.max(1, Math.ceil(active.data.total / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [active.data?.total, page, pageSize]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, []);

  // Selection is scoped to the current result set: any change to what's being
  // listed clears it so a bulk action can never hit messages the user can't see.
  useEffect(() => {
    clearSelection();
  }, [folder, filter, sort, search, clearSelection]);

  const selectFolder = (path: string) => {
    setFolder(path);
    setSelectedUid(null);
    setPage(1);
    setSearch('');
    setSearchInput('');
  };

  const submitSearch = () => {
    setSearch(searchInput);
    setSelectedUid(null);
    setPage(1);
  };

  const selectFilter = (next: MessageListFilter) => {
    setFilter(next);
    setSelectedUid(null);
    setPage(1);
  };

  const selectSort = (next: MessageListSort) => {
    setSort(next);
    setSelectedUid(null);
    setPage(1);
  };

  const openCompose = (draft: ComposeDraft) => setCompose({ opened: true, draft });
  const closeCompose = () => setCompose((c) => ({ ...c, opened: false }));
  const openReply = (m: MessageDetail) => openCompose(replyDraft(m));
  const openForward = (m: MessageDetail) => openCompose(forwardDraft(m));
  const openMessageWindow = (uid: number) =>
    openMessagePopup(mailApi.messageWindowUrl(folder, uid));

  const onRowAction = (uid: number, act: RowAction) => {
    action.mutate({ folder, uids: [uid], action: act });
    if (act === 'delete' && selectedUid === uid) setSelectedUid(null);
  };

  const onDelete = (m: MessageDetail) => {
    action.mutate({ folder: m.folder, uids: [m.uid], action: 'delete' });
    setSelectedUid(null);
  };

  const onMarkSpam = (m: MessageDetail) => {
    action.mutate({ folder: m.folder, uids: [m.uid], action: 'markSpam' });
    setSelectedUid(null);
  };

  const onNotSpam = (m: MessageDetail) => {
    action.mutate({ folder: m.folder, uids: [m.uid], action: 'notSpam' });
    setSelectedUid(null);
  };

  // ── Selection helpers ─────────────────────────────────────────────────────
  const pageUids = useMemo(() => messages.map((m) => m.uid), [messages]);
  const pageAllSelected = pageUids.length > 0 && pageUids.every((u) => selected.has(u));
  const pageSomeSelected = pageUids.some((u) => selected.has(u));

  const toggleOne = (uid: number) => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const togglePage = () => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pageUids.forEach((u) => next.delete(u));
      else pageUids.forEach((u) => next.add(u));
      return next;
    });
  };

  const selectAllMatching = async () => {
    const { uids } = await mailApi.getMessageUids(folder, filter, search.trim());
    setSelected(new Set(uids));
    setAllMatching(true);
  };

  // ── Bulk actions over the current selection ───────────────────────────────
  const runBulk = (act: 'markSeen' | 'markUnseen' | 'delete' | 'move', targetFolder?: string) => {
    const uids = Array.from(selected);
    if (uids.length === 0) return;
    action.mutate({ folder, uids, action: act, targetFolder });
    if (selectedUid !== null && selected.has(selectedUid) && (act === 'delete' || act === 'move')) {
      setSelectedUid(null);
    }
    clearSelection();
  };

  // Mark the selection read — unless every selected message we can see is
  // already read, in which case mark them unread (toggle behavior).
  const bulkToggleRead = () => {
    const visible = messages.filter((m) => selected.has(m.uid));
    const allRead = visible.length > 0 && visible.every((m) => m.seen);
    runBulk(allRead ? 'markUnseen' : 'markSeen');
  };

  const bulkMove = (targetFolder: string) => runBulk('move', targetFolder);
  const bulkDelete = () => runBulk('delete');

  const currentFolderRole: FolderRole | undefined = (folders.data ?? []).find(
    (f) => f.path === folder,
  )?.role;

  // Folders a bulk move can target: any selectable folder other than the
  // current one (you can't move messages into the folder they're already in).
  const moveTargets: MailFolder[] = (folders.data ?? []).filter(
    (f) => f.selectable && f.path !== folder,
  );

  return {
    // folders
    folders,
    folder,
    selectFolder,
    currentFolderRole,
    moveTargets,

    // listing
    messages,
    total,
    listLoading: active.isLoading || active.isFetching,

    // reading
    selectedUid,
    setSelectedUid,
    message,
    openMessageWindow,

    // search
    searchInput,
    setSearchInput,
    submitSearch,
    search,

    // filter / sort
    filter,
    selectFilter,
    sort,
    selectSort,

    // paging
    page,
    setPage,
    pageSize,

    // compose
    compose,
    openCompose,
    closeCompose,
    openReply,
    openForward,

    // single-message actions
    onRowAction,
    onDelete,
    onMarkSpam,
    onNotSpam,

    // selection
    selected,
    selectedCount: selected.size,
    allMatching,
    pageAllSelected,
    pageSomeSelected,
    toggleOne,
    togglePage,
    selectAllMatching,
    clearSelection,

    // bulk
    action,
    bulkToggleRead,
    bulkMove,
    bulkDelete,
  };
}

export type MailboxController = ReturnType<typeof useMailbox>;
