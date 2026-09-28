/* SplitEase — Cloud Layer (Supabase)
 * شات لحظي + مزامنة مصاريف لحظية + صلاحيات + نظام ID
 * Requires: supabase-js v2 loaded before this file
 */
(function () {
  'use strict';

  if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.url || SUPABASE_CONFIG.url.includes('YOUR_PROJECT')) {
    window.Cloud = { enabled: false, ready: false };
    return;
  }

  const sb = new Proxy({}, {
    get(_t, prop) { return resolveClient()[prop]; }
  });

  // One Supabase client per page. app.js already builds one from the same
  // config; making a second one meant two auth listeners on the same session,
  // so a single sign-in fired the "signed in" toast and handleRoute twice.
  // cloud.js loads before app.js, so the lookup has to be lazy.
  let _client = null;
  function resolveClient() {
    if (_client) return _client;
    _client = (window.supabaseClient && window.supabaseClient.auth)
      ? window.supabaseClient
      : supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    if (!window.supabaseClient) window.supabaseClient = _client;
    return _client;
  }


  const Cloud = {
    enabled: true,
    ready: false,
    sb,
    user: null,
    /* my unique short code (Invite ID) — assigned server-side, cached here */
    myCode: null,
    _profile: null,
    _channels: {},   // groupId -> channel
    _subs: [],
  };

  /* ── Helpers ── */
  function currentUserId() {
    return Cloud.user ? Cloud.user.id : null;
  }

  // Reads the caller's own membership row. RLS makes this return nothing unless
  // the user really is a member, so a null result is a valid "no".
  async function isMember(gid) {
    const uid = currentUserId();
    if (!uid) return null;
    const { data, error } = await sb.from('group_members')
      .select('user_id, role, can_edit, display_name')
      .eq('group_id', gid).eq('user_id', uid).maybeSingle();
    if (error) { console.warn('isMember', error); return null; }
    return data || null;
  }

  /* ── Auth lifecycle ──
   * Deliberately does not register its own onAuthStateChange: app.js owns the
   * single listener and pushes changes in through Cloud.setUser(), so signing in
   * cannot trigger two toasts or two route passes.
   */
  Cloud.init = async function () {
    const { data: { session } } = await sb.auth.getSession();
    Cloud.user = session?.user || null;
    Cloud.ready = true;
    return Cloud.user;
  };

  Cloud.setUser = function (user) {
    if (Cloud.user?.id === user?.id) return;
    Cloud.user = user || null;
    Cloud._profile = null;
    Cloud.myCode = null;
  };

  /* ── Profile (the code an admin types to add you) ──
   * The code is generated and owned by the database. The previous client kept
   * it in localStorage with Math.random(), so signing in on a second device
   * produced a second code for the same person.
   */
  Cloud.myProfile = async function (displayName) {
    const u = Cloud.user; if (!u) return null;
    if (!displayName && Cloud._profile) return Cloud._profile;

    if (displayName) {
      const { data, error } = await sb.rpc('upsert_my_profile', { p_display_name: displayName });
      if (error) { console.warn('upsertMyProfile', error); return null; }
      Cloud._profile = data; Cloud.myCode = data?.code || null;
      return Cloud._profile;
    }

    const { data, error } = await sb.from('profiles')
      .select('id, code, display_name').eq('id', u.id).maybeSingle();
    if (error) { console.warn('myProfile', error); return null; }
    Cloud._profile = data || null;
    Cloud.myCode = data?.code || null;
    return Cloud._profile;
  };

  Cloud.getMyCode = async function () {
    if (Cloud.myCode) return Cloud.myCode;
    await Cloud.myProfile();
    return Cloud.myCode;
  };

  Cloud.upsertMyProfile = async function (displayName) {
    const p = await Cloud.myProfile(displayName || Cloud.user?.user_metadata?.full_name || Cloud.user?.email || '');
    return p ? p.code : null;
  };

  // Resolve a member's shareable code -> { id, display_name }.
  // Goes through find_profile_by_code() because the profiles table is
  // self-read-only; a direct select would be denied by RLS.
  Cloud.lookupByCode = async function (code) {
    const clean = (code || '').trim().toUpperCase();
    if (!clean) return null;
    const { data, error } = await sb.rpc('find_profile_by_code', { p_code: clean });
    if (error) { console.warn('lookupByCode', error); return null; }
    return (data && data[0]) || null;
  };

  /* ── Groups ── */
  // create_group() is a single RPC: the group row and the owner membership are
  // written in one transaction. Doing it as two client calls left a group that
  // its own creator could not see, because groups_select is gated on membership.
  Cloud.createGroup = async function ({ name, currency, icon, color }) {
    const u = Cloud.user; if (!u) throw new Error('سجّل دخولك أولاً');
    const { data, error } = await sb.rpc('create_group', {
      p_name: name, p_currency: currency || 'EGP', p_icon: icon || '👥', p_color: color || '#0D9488',
    });
    if (error) throw error;
    return data;
  };

  Cloud.myGroups = async function () {
    const u = Cloud.user; if (!u) return [];
    const { data: mem } = await sb.from('group_members')
      .select('group_id').eq('user_id', u.id);
    const ids = (mem || []).map(m => m.group_id);
    if (ids.length === 0) return [];
    const { data } = await sb.from('groups').select('*').in('id', ids);
    return data || [];
  };

  // Joining now takes an invite CODE, not a group id. A group UUID was a
  // permanent, unrevocable bearer secret: once shared, anyone who saw the link
  // was in the group forever. The invite code can be expired, capped or revoked.
  Cloud.joinGroup = async function (codeOrLink) {
    const u = Cloud.user; if (!u) throw new Error('سجّل دخولك أولاً');
    let code = (codeOrLink || '').trim();
    if (code.includes('join=')) code = code.split('join=')[1].split(/[&#/]/)[0];
    code = code.trim().toUpperCase();
    if (!code) throw new Error('اكتب كود الدعوة');

    const { data, error } = await sb.rpc('join_group', { p_code: code });
    if (error) throw friendlyJoinError(error);
    return { ok: true, groupId: data };
  };

  function friendlyJoinError(error) {
    const m = String(error?.message || '');
    if (m.includes('invalid invite code')) return new Error('كود الدعوة غير صحيح');
    if (m.includes('revoked')) return new Error('كود الدعوة اتلغى — اطلب كود جديد');
    if (m.includes('expired')) return new Error('كود الدعوة انتهت صلاحيته');
    if (m.includes('no uses left')) return new Error('كود الدعوة خلصت أستخدمه — اطلب كود جديد');
    if (m.includes('not authenticated')) return new Error('سجّل دخولك أولاً');
    return error;
  }

  /* ── Rooms ──
   * A room is a group opened by name + password instead of by invite code.
   * join_room answers with jsonb rather than raising, so a wrong password and
   * a room that does not exist produce the same payload — see 0002_rooms.sql.
   */
  Cloud.createRoom = async function ({ name, password, roomType, currency, displayName }) {
    const u = Cloud.user; if (!u) throw new Error('سجّل دخولك أولاً');
    const { data, error } = await sb.rpc('create_room', {
      p_name: name,
      p_password: password,
      p_room_type: roomType || 'friends',
      p_currency: currency || 'EGP',
      p_display_name: displayName || null,
    });
    if (error) throw friendlyRoomError(error);
    return data;
  };

  Cloud.joinRoom = async function ({ name, password, displayName }) {
    const u = Cloud.user; if (!u) throw new Error('سجّل دخولك أولاً');
    const { data, error } = await sb.rpc('join_room', {
      p_name: name,
      p_password: password,
      p_display_name: displayName || null,
    });
    if (error) throw friendlyRoomError(error);
    if (!data || data.ok !== true) {
      const e = new Error(roomErrorMessage(data && data.error));
      e.retryAfter = data && data.retry_after;
      throw e;
    }
    return { ok: true, roomId: data.room_id };
  };

  Cloud.setRoomPassword = async function (roomId, newPassword) {
    const { error } = await sb.rpc('set_room_password', {
      p_room_id: roomId, p_new_password: newPassword,
    });
    if (error) throw friendlyRoomError(error);
  };

  Cloud.setRoomType = async function (roomId, roomType) {
    const { error } = await sb.rpc('set_room_type', { p_room_id: roomId, p_room_type: roomType });
    if (error) throw friendlyRoomError(error);
  };

  Cloud.setMyRoomName = async function (roomId, displayName) {
    const { error } = await sb.rpc('set_my_room_name', {
      p_room_id: roomId, p_display_name: displayName,
    });
    if (error) throw friendlyRoomError(error);
  };

  Cloud.changeMemberRole = async function (roomId, userId, role) {
    const { error } = await sb.rpc('change_member_role', {
      p_room_id: roomId, p_user_id: userId, p_role: role,
    });
    if (error) throw friendlyRoomError(error);
  };

  function roomErrorMessage(code) {
    switch (code) {
      case 'not_authenticated': return 'سجّل دخولك أولاً';
      case 'too_many_attempts': return 'حاولت كتير — استنى شوية وجرّب تاني';
      case 'invalid_credentials':
      default: return 'اسم الغرفة أو كلمة المرور غير صحيحة';
    }
  }

  // Postgres reports the unique index on lower(name) as 23505; the rest of the
  // room errors are raised with Arabic-facing messages already.
  function friendlyRoomError(error) {
    if (error?.code === '23505') return new Error('اسم الغرفة ده مستخدم — جرّب اسم تاني');
    const m = String(error?.message || '');
    if (m.includes('not authenticated')) return new Error('سجّل دخولك أولاً');
    if (m.includes('at least 6')) return new Error('كلمة المرور 6 أحرف على الأقل');
    if (m.includes('room name must be between')) return new Error('اسم الغرفة من 2 لـ 60 حرف');
    if (m.includes('only a room admin')) return new Error('الأدمن فقط يقدر يعمل ده');
    if (m.includes('keep at least one admin')) return new Error('الغرفة لازم يفضل فيها أدمن واحد');
    if (m.includes('not a member')) return new Error('مش عضو في الغرفة دي');
    return error;
  }

  /* ── Members & admin controls ── */
  Cloud.members = async function (groupId) {
    const { data } = await sb.from('group_members')
      .select('*').eq('group_id', groupId).order('joined_at');
    return data || [];
  };

  Cloud.addMemberByCode = async function (groupId, code) {
    const me = await isMember(groupId);
    if (!me || me.role !== 'admin') throw new Error('الأدمن فقط يقدر يضيف أعضاء');
    const profile = await Cloud.lookupByCode(code);
    if (!profile) throw new Error('لا يوجد مستخدم بهذا الكود');
    const { error } = await sb.from('group_members').insert({
      group_id: groupId, user_id: profile.id,
      display_name: profile.display_name || '', role: 'member', can_edit: true,
    });
    if (error) {
      if (String(error.message).includes('duplicate')) throw new Error('العضو موجود بالفعل');
      throw error;
    }
    return true;
  };

  Cloud.setMemberPermission = async function (groupId, userId, canEdit) {
    const { error } = await sb.from('group_members')
      .update({ can_edit: canEdit }).eq('group_id', groupId).eq('user_id', userId);
    if (error) throw error;
  };

  Cloud.removeMember = async function (groupId, userId) {
    const { error } = await sb.from('group_members')
      .delete().eq('group_id', groupId).eq('user_id', userId);
    if (error) throw error;
  };

  Cloud.isAdmin = async function (groupId) {
    const me = await isMember(groupId);
    return !!me && me.role === 'admin';
  };
  Cloud.canEdit = async function (groupId) {
    const me = await isMember(groupId);
    return !!me && (me.role === 'admin' || me.can_edit === true);
  };

  /* ── Group invites ── */
  Cloud.listInvites = async function (groupId) {
    const { data } = await sb.from('group_invites')
      .select('id, code, expires_at, max_uses, uses, revoked, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });
    return data || [];
  };

  Cloud.createInvite = async function (groupId, opts) {
    const o = opts || {};
    const { data, error } = await sb.rpc('create_invite', {
      p_group_id: groupId,
      p_expires_in_hours: o.expiresInHours == null ? null : Number(o.expiresInHours),
      p_max_uses: o.maxUses == null ? null : Number(o.maxUses),
    });
    if (error) throw error;
    return data;
  };

  Cloud.revokeInvite = async function (inviteId) {
    const { error } = await sb.rpc('revoke_invite', { p_invite_id: inviteId });
    if (error) throw error;
  };

  Cloud.inviteLink = function (code) {
    return location.origin + location.pathname + '#join=' + encodeURIComponent(code);
  };

  /* ── Expenses ── */
  Cloud.addExpense = async function (gid, exp) {
    const u = Cloud.user; if (!u) throw new Error('سجّل دخولك أولاً');
    const { data, error } = await sb.from('expenses').insert({
      group_id: gid, created_by: u.id,
      description: exp.description, amount: exp.amount, category: exp.category,
      date: exp.date, split_type: exp.splitType,
      paid_by: exp.paidBy, shares: exp.shares,
    }).select().single();
    if (error) throw error;
    return data;
  };

  Cloud.listExpenses = async function (gid) {
    const { data } = await sb.from('expenses')
      .select('*').eq('group_id', gid).order('date', { ascending: false });
    return data || [];
  };

  Cloud.updateExpense = async function (gid, eid, patch) {
    const { error } = await sb.from('expenses').update(patch).eq('id', eid).eq('group_id', gid);
    if (error) throw error;
  };

  Cloud.deleteExpense = async function (gid, eid) {
    const { error } = await sb.from('expenses').delete().eq('id', eid).eq('group_id', gid);
    if (error) throw error;
  };

  /* ── Settlements ── */
  Cloud.addSettlement = async function (gid, s) {
    const u = Cloud.user; if (!u) throw new Error('سجّل دخولك أولاً');
    const { data, error } = await sb.from('settlements').insert({
      group_id: gid, created_by: u.id,
      from_user: s.from, to_user: s.to, amount: s.amount,
      method: s.method, status: s.status || 'paid', date: s.date,
    }).select().single();
    if (error) throw error;
    return data;
  };
  Cloud.listSettlements = async function (gid) {
    const { data } = await sb.from('settlements')
      .select('*').eq('group_id', gid).order('date', { ascending: false });
    return data || [];
  };

  /* ── Chat ── */
  Cloud.sendMessage = async function (gid, text) {
    const u = Cloud.user; if (!u) throw new Error('سجّل دخولك أولاً');
    const me = await isMember(gid);
    const name = (me && me.display_name) || u.user_metadata?.full_name || u.email || '';
    const { data, error } = await sb.from('messages').insert({
      group_id: gid, user_id: u.id, user_name: name, text,
    }).select().single();
    if (error) throw error;
    return data;
  };

  Cloud.listMessages = async function (gid, limit = 200) {
    const { data } = await sb.from('messages')
      .select('*').eq('group_id', gid)
      .order('created_at', { ascending: true }).limit(limit);
    return data || [];
  };

  /* ── Realtime ──
   * subscribe(groupId, handlers) where handlers = { onMessage, onExpense,
   * onSettlement, onMembers } — each receives the new row. */
  Cloud.subscribe = function (groupId, handlers) {
    if (Cloud._channels[groupId]) return Cloud._channels[groupId];

    const ch = sb.channel('group:' + groupId);

    if (handlers.onMessage) {
      ch.on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: 'group_id=eq.' + groupId },
        (payload) => handlers.onMessage(payload.new));
    }
    if (handlers.onExpense) {
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table: 'expenses', filter: 'group_id=eq.' + groupId },
        (payload) => handlers.onExpense(payload));
    }
    if (handlers.onSettlement) {
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table: 'settlements', filter: 'group_id=eq.' + groupId },
        (payload) => handlers.onSettlement(payload));
    }
    if (handlers.onMembers) {
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: 'group_id=eq.' + groupId },
        (payload) => handlers.onMembers(payload));
    }

    ch.subscribe();
    Cloud._channels[groupId] = ch;
    return ch;
  };

  Cloud.unsubscribe = function (groupId) {
    const ch = Cloud._channels[groupId];
    if (ch) { sb.removeChannel(ch); delete Cloud._channels[groupId]; }
  };

  window.Cloud = Cloud;
})();
