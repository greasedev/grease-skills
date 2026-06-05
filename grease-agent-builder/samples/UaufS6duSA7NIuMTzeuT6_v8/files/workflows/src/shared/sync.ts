// Tweet sync utilities shared between workflow and UI

import type { Agent } from '@greaseclaw/workflow-sdk';
import { createWorkflowApis } from '../api';
import {
  extractSearchTweets,
  extractTwitterLists,
  extractTwitterUserCandidates,
  getSavedLists,
  getAllInterestFields,
  interestIdFor,
  saveLists,
  saveTweets,
  sleep,
  cleanHandle,
  type TwitterList,
  type TwitterUserCandidate,
} from './index';

const apiIntervalMs = 15_000;
const defaultTweetLimit = 100;
const defaultMemberLimit = 500;

export type SyncList = {
  key: string;
  name: string;
  listId: string;
  interestId?: string;
};

export type SyncResult = {
  success: boolean;
  message: string;
  interest: string;
  limit: number;
  syncedLists: Array<{
    key: string;
    name: string;
    listId: string;
    fetched: number;
    newTweets: number;
  }>;
  seenTweets: number;
  newTweets: number;
};

export type SyncProgress = {
  phase: 'prepare' | 'fetch' | 'save' | 'done' | 'error';
  message: string;
  current: number;
  total: number;
  listName?: string;
};

export type SyncOptions = {
  interest?: string;
  listIds?: string[];
  lists?: Array<{ key?: string; name?: string; listId: string }>;
  limit?: number;
  onProgress?: (progress: SyncProgress) => void;
};

export type ListMemberSyncResult = {
  success: boolean;
  message: string;
  syncedLists: Array<{
    key: string;
    name: string;
    listId: string;
    localCount: number;
    remoteCount: number;
    added: number;
    removed: number;
  }>;
  duplicatesRemoved: number;
  totalMembers: number;
};

export type ListMemberSyncProgress = {
  phase: 'prepare' | 'fetch' | 'compare' | 'update' | 'done' | 'error';
  message: string;
  current: number;
  total: number;
  listName?: string;
};

export type ListMemberSyncOptions = {
  interest?: string;
  onProgress?: (progress: ListMemberSyncProgress) => void;
};

export async function syncListTweets(
  agent: Agent,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const apis = createWorkflowApis(agent);
  const limit = normalizeLimit(options.limit, defaultTweetLimit);
  const onProgress = options.onProgress;

  // Determine interests to process
  const interests = options.interest?.trim()
    ? [options.interest.trim()]
    : (await getAllInterestFields(agent)).map(f => f.topic);

  if (!interests.length) {
    onProgress?.({ phase: 'done', message: '没有需要同步的兴趣领域', current: 0, total: 0 });
    return {
      success: true,
      message: 'No interests to sync',
      interest: '',
      limit,
      syncedLists: [],
      seenTweets: 0,
      newTweets: 0,
    };
  }

  const allSyncedLists: SyncResult['syncedLists'] = [];
  let totalSeenTweets = 0;
  let totalNewTweets = 0;

  for (const interest of interests) {
    onProgress?.({ phase: 'prepare', message: `正在同步 ${interest}...`, current: 0, total: 0 });

    const lists = await resolveLists(agent, apis, { ...options, interest }, interest);
    let newTweets = 0;
    let seenTweets = 0;

    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      onProgress?.({
        phase: 'fetch',
        message: `[${interest}] 正在获取 ${list.name} 的 tweets...`,
        current: i + 1,
        total: lists.length,
        listName: list.name,
      });

      const response = await callWithLimit(() => apis.twitter_list_tweets(list.listId, limit));
      const tweets = extractSearchTweets(response);

      onProgress?.({
        phase: 'save',
        message: `[${interest}] 正在保存 ${tweets.length} 条 tweets...`,
        current: i + 1,
        total: lists.length,
        listName: list.name,
      });

      const added = await saveTweets(agent, interest, {
        listId: list.listId,
        listName: list.name,
      }, tweets);
      newTweets += added;
      seenTweets += tweets.length;
      allSyncedLists.push({
        key: list.key,
        name: list.name,
        listId: list.listId,
        fetched: tweets.length,
        newTweets: added,
      });
    }

    totalSeenTweets += seenTweets;
    totalNewTweets += newTweets;
  }

  onProgress?.({
    phase: 'done',
    message: `同步完成，共 ${interests.length} 个领域，获取 ${totalSeenTweets} 条，新增 ${totalNewTweets} 条`,
    current: allSyncedLists.length,
    total: allSyncedLists.length,
  });

  return {
    success: true,
    message: `Synced ${totalSeenTweets} tweet(s), saved ${totalNewTweets} new tweet(s) from ${allSyncedLists.length} list(s) across ${interests.length} interest(s)`,
    interest: interests.join(', '),
    limit,
    syncedLists: allSyncedLists,
    seenTweets: totalSeenTweets,
    newTweets: totalNewTweets,
  };
}

async function resolveLists(
  agent: Agent,
  apis: ReturnType<typeof createWorkflowApis>,
  options: SyncOptions,
  interest: string,
): Promise<SyncList[]> {
  if (Array.isArray(options.lists) && options.lists.length) {
    return options.lists
      .map((item, index) => normalizeInputList(item, index))
      .filter((item): item is SyncList => Boolean(item?.listId));
  }

  if (Array.isArray(options.listIds) && options.listIds.length) {
    return options.listIds.map((id, index) => ({
      key: `manual-${index}`,
      name: `List ${id}`,
      listId: String(id),
    }));
  }

  const savedLists = await getSavedLists(agent);
  const targetInterestId = interestIdFor(interest);
  const matching = savedLists
    .filter(list => list.listId)
    .filter(list => !options.interest || list.interestId === targetInterestId)
    .map(list => ({
      key: list.key,
      name: list.name,
      listId: list.listId!,
      interestId: list.interestId,
    }));
  if (matching.length) return dedupeLists(matching);

  const response = await callWithLimit(() => apis.twitter_lists(100));
  const ownedLists = extractTwitterLists(response)
    .filter(list => list.type === 'suggest_owned_subscribed_list')
    .map(list => ({
      key: list.name,
      name: list.name,
      listId: list.id,
      interestId: targetInterestId,
    }));
  await saveLists(agent, interest, ownedLists.map(list => ({
    key: list.key,
    name: list.name,
    listId: list.listId,
    mode: 'reuse',
    created: false,
  })));
  return dedupeLists(ownedLists);
}

function normalizeInputList(value: unknown, index: number): SyncList | null {
  if (typeof value === 'string') {
    return { key: `manual-${index}`, name: `List ${value}`, listId: value };
  }
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<TwitterList> & { listId?: string; key?: string };
  const listId = item.listId || item.id || '';
  if (!listId) return null;
  return {
    key: item.key || item.name || `manual-${index}`,
    name: item.name || `List ${listId}`,
    listId,
  };
}

function dedupeLists(lists: SyncList[]): SyncList[] {
  const seen = new Set<string>();
  return lists.filter(list => {
    if (seen.has(list.listId)) return false;
    seen.add(list.listId);
    return true;
  });
}

function normalizeLimit(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(1, Math.round(number)));
}

let nextApiAt = 0;

async function callWithLimit<T>(call: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const waitMs = Math.max(0, nextApiAt - now);
  nextApiAt = Math.max(now, nextApiAt) + apiIntervalMs;
  if (waitMs > 0) await sleep(waitMs);
  return call();
}

export async function syncListMembers(
  agent: Agent,
  options: ListMemberSyncOptions = {},
): Promise<ListMemberSyncResult> {
  const apis = createWorkflowApis(agent);
  const onProgress = options.onProgress;

  // Determine interests to process
  const interests = options.interest?.trim()
    ? [options.interest.trim()]
    : (await getAllInterestFields(agent)).map(f => f.topic);

  if (!interests.length) {
    onProgress?.({ phase: 'done', message: '没有需要同步的兴趣领域', current: 0, total: 0 });
    return {
      success: true,
      message: 'No interests to sync',
      syncedLists: [],
      duplicatesRemoved: 0,
      totalMembers: 0,
    };
  }

  const allSyncedLists: ListMemberSyncResult['syncedLists'] = [];
  let totalAddedToLocal = 0;
  let totalAddedToRemote = 0;
  let totalDuplicatesRemoved = 0;
  let totalMembers = 0;

  for (const interest of interests) {
    const targetInterestId = interestIdFor(interest);

    onProgress?.({ phase: 'prepare', message: `正在准备同步 ${interest} 的列表成员...`, current: 0, total: 0 });

    // Get saved lists for this interest
    const savedLists = await getSavedLists(agent);
    const listsWithId = savedLists
      .filter(list => list.listId)
      .filter(list => list.interestId === targetInterestId);

    if (!listsWithId.length) {
      continue;
    }

    // Read local kols for this interest
    const db = await agent.getDb();
    const kolsTable = db.table('kols');
    const localKols = await kolsTable
      .where('interestId')
      .equals(targetInterestId)
      .toArray() as Array<{ id: string; handle?: string; listKey?: string; interestId?: string }>;

    // Build local state: handle -> listKey
    const localHandleToListKey = new Map<string, string>();
    const localByListKey = new Map<string, Set<string>>();
    for (const kol of localKols) {
      const handle = cleanHandle(kol.handle || '').toLowerCase();
      if (!handle) continue;
      const listKey = kol.listKey || '';
      if (!listKey) continue;
      localHandleToListKey.set(handle, listKey);
      if (!localByListKey.has(listKey)) localByListKey.set(listKey, new Set());
      localByListKey.get(listKey)!.add(handle);
    }

    // Collect remote members and their full data
    const remoteHandleToListIds = new Map<string, string[]>();
    const remoteByListId = new Map<string, Set<string>>();
    const remoteMemberData = new Map<string, TwitterUserCandidate>(); // Store full member data

    for (let i = 0; i < listsWithId.length; i++) {
      const list = listsWithId[i];
      onProgress?.({
        phase: 'fetch',
        message: `[${interest}] 正在获取 ${list.name} 的成员...`,
        current: i + 1,
        total: listsWithId.length,
        listName: list.name,
      });

      const response = await callWithLimit(() => apis.twitter_list_members(list.listId!, defaultMemberLimit));
      const remoteMembers = extractTwitterUserCandidates(response, `list:${list.listId}`);

      for (const member of remoteMembers) {
        const handle = cleanHandle(member.handle || member.username || member.name || '').toLowerCase();
        if (!handle) continue;

        // Store member data for later use
        if (!remoteMemberData.has(handle)) {
          remoteMemberData.set(handle, member);
        }

        if (!remoteHandleToListIds.has(handle)) remoteHandleToListIds.set(handle, []);
        remoteHandleToListIds.get(handle)!.push(list.listId!);
        if (!remoteByListId.has(list.listId!)) remoteByListId.set(list.listId!, new Set());
        remoteByListId.get(list.listId!)!.add(handle);
      }
    }

    let addedToLocal = 0;
    let addedToRemote = 0;
    let duplicatesRemoved = 0;

    // Phase 1: Add
    for (const [handle, listIds] of remoteHandleToListIds.entries()) {
      if (!localHandleToListKey.has(handle)) {
        const listId = listIds[0];
        const matchingList = listsWithId.find(l => l.listId === listId);
        const listKey = matchingList?.key || listId;

        // Get the member data from stored remote data
        const memberData = remoteMemberData.get(handle);

        const now = new Date().toISOString();
        await kolsTable.put({
          id: `${targetInterestId}:${handle}`,
          interestId: targetInterestId,
          name: memberData?.name || handle,
          handle,
          listKey,
          role: memberData?.verified ? 'Verified KOL' : 'KOL',
          content: memberData?.bio || '',
          stance: '',
          lang: 'EN',
          focus: 70,
          diversity: 50,
          reason: memberData?.reason || `From X.com list: ${matchingList?.name || listId}`,
          selected: true,
          candidateSource: 'list_sync',
          source: memberData || { handle, username: handle, source: `list:${listId}` },
          createdAt: now,
          updatedAt: now,
        });

        localHandleToListKey.set(handle, listKey);
        if (!localByListKey.has(listKey)) localByListKey.set(listKey, new Set());
        localByListKey.get(listKey)!.add(handle);
        addedToLocal += 1;
      }
    }

    // Add to X.com
    for (const [handle, listKey] of localHandleToListKey.entries()) {
      const remoteListIds = remoteHandleToListIds.get(handle);
      if (!remoteListIds?.length) {
        const matchingList = listsWithId.find(l => l.key === listKey || l.listId === listKey);
        if (matchingList?.listId) {
          onProgress?.({
            phase: 'update',
            message: `[${interest}] 正在添加 @${handle} 到 ${matchingList.name}...`,
            current: 1,
            total: 1,
            listName: matchingList.name,
          });

          await callWithLimit(() => apis.twitter_list_add(matchingList.listId!, handle));
          addedToRemote += 1;

          if (!remoteByListId.has(matchingList.listId)) remoteByListId.set(matchingList.listId, new Set());
          remoteByListId.get(matchingList.listId)!.add(handle);
          if (!remoteHandleToListIds.has(handle)) remoteHandleToListIds.set(handle, []);
          remoteHandleToListIds.get(handle)!.push(matchingList.listId);
        }
      }
    }

    // Phase 2: Remove duplicates
    for (const [handle, listIds] of remoteHandleToListIds.entries()) {
      if (listIds.length > 1) {
        const localListKey = localHandleToListKey.get(handle);
        const correctList = listsWithId.find(l => l.key === localListKey || l.listId === localListKey);
        const correctListId = correctList?.listId || listIds[0];

        for (const listId of listIds) {
          if (listId !== correctListId) {
            const list = listsWithId.find(l => l.listId === listId);
            onProgress?.({
              phase: 'update',
              message: `[${interest}] 正在从 ${list?.name || listId} 移除重复的 @${handle}...`,
              current: 1,
              total: 1,
              listName: list?.name,
            });

            await callWithLimit(() => apis.twitter_list_remove(listId, handle));
            duplicatesRemoved += 1;

            remoteByListId.get(listId)?.delete(handle);
            const newListIds = listIds.filter(id => id !== listId);
            remoteHandleToListIds.set(handle, newListIds);
          }
        }
      }
    }

    // Build result for this interest
    for (const list of listsWithId) {
      const listKey = list.key || list.listId!;
      const localHandles = localByListKey.get(listKey) || new Set();
      const remoteHandles = remoteByListId.get(list.listId!) || new Set();

      allSyncedLists.push({
        key: listKey,
        name: `${interest} - ${list.name || ''}`,
        listId: list.listId!,
        localCount: localHandles.size,
        remoteCount: remoteHandles.size,
        added: addedToLocal + addedToRemote,
        removed: duplicatesRemoved,
      });
    }

    totalAddedToLocal += addedToLocal;
    totalAddedToRemote += addedToRemote;
    totalDuplicatesRemoved += duplicatesRemoved;
    totalMembers += localHandleToListKey.size;
  }

  onProgress?.({
    phase: 'done',
    message: `同步完成：${interests.length} 个领域，本地新增 ${totalAddedToLocal}，X.com新增 ${totalAddedToRemote}，移除重复 ${totalDuplicatesRemoved}`,
    current: allSyncedLists.length,
    total: allSyncedLists.length,
  });

  return {
    success: true,
    message: `Synced ${interests.length} interests: added ${totalAddedToLocal} to local, ${totalAddedToRemote} to X.com, removed ${totalDuplicatesRemoved} duplicates`,
    syncedLists: allSyncedLists,
    duplicatesRemoved: totalDuplicatesRemoved,
    totalMembers,
  };
}