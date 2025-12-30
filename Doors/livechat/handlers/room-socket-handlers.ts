export function setupRoomHandlers(sock: any, st: any, ou: Map<any, any>, uid: number, un: string, nid: number, ps: any, ucl: () => void, uut: () => void, usb: () => void, asm: (m: string) => void, aa: (a: string) => void, aud: any, hl: () => void, sc: (s: any, c: string) => void, setCrl: (value: string) => void, smd: (t: string, cb?: () => void) => void, ib: any, s: any) {
  sock.on('room:list', (d: any) => {
    const rs = Array.isArray(d?.rooms) ? d.rooms : [];
    if (rs.length > 0) {
      st.channels = rs.map((r: any) => ({ id: r.room_id || r.roomId || r.room_name || r.roomName, name: r.room_name || r.roomName, displayName: '#' + (r.room_name || r.roomName), topic: r.topic || '', type: r.is_public !== false ? 'public' : 'private', createdBy: r.created_by_username || 'system', createdAt: new Date(r.created_at || Date.now()), memberCount: r.member_count || 0, unreadCount: 0 }));
      ucl();
      usb();
      asm(`Found ${rs.length} room${rs.length === 1 ? '' : 's'}`);
      if (!st.currentChannel) {
        const dr = st.channels.find((c: any) => c.name === 'general' && c.type === 'public') || st.channels.find((c: any) => c.type === 'public') || st.channels[0];
        if (dr) {
          sock.emit('room:join', { roomName: dr.name });
          asm(`Auto-joining #${dr.name}...`);
        }
      }
    } else if (!st.currentChannel) {
      asm('No rooms found - creating #general...');
      sock.emit('room:create', { roomName: 'general', topic: 'General chat', isPublic: true });
    }
    hl();
  });

  sock.on('room:joined', (d: any) => {
    sc(st, d.roomId || d.roomName);
    setCrl(d.roomName || '');
    if (d.members && Array.isArray(d.members)) {
      ou.clear();
      // Find current user in members list to get their UUID
      const currentUserMember = d.members.find((m: any) => m.username === un);
      if (currentUserMember) {
        const currentUserId = String(currentUserMember.user_id || currentUserMember.userId);
        ou.set(currentUserId, { username: un, status: 'online', nodeId: nid, joinedAt: new Date() });
        // Add all other members using UUID comparison
        for (const m of d.members) {
          const memberId = String(m.user_id || m.userId);
          if (memberId !== currentUserId) {
            ou.set(memberId, { username: m.username, status: m.is_muted ? 'dnd' : 'online', joinedAt: new Date() });
          }
        }
      }
    }
    ucl();
    uut();
    usb();
    asm(`Joined #${d.roomName} (${d.memberCount || ou.size} users)`);
    aa(`Joined #${d.roomName}`);
    aud.onNotification();
  });

  sock.on('room:left', (d: any) => { sc(st, ''); setCrl(''); ucl(); usb(); asm(`Left ${d.roomName}`); });

  sock.on('room:created', (d: any) => {
    st.channels.push({ id: d.roomId, name: d.roomName, displayName: '#' + d.roomName, topic: d.topic || '', type: d.isPublic ? 'public' : 'private', createdBy: un, createdAt: new Date(), memberCount: 1, unreadCount: 0 });
    ucl();
    asm(`Room "#${d.roomName}" created!`);
    aa(`Created #${d.roomName}`);
    if (!st.currentChannel) {
      sock.emit('room:join', { roomName: d.roomName });
      asm(`Auto-joining #${d.roomName}...`);
    }
  });

  sock.on('room:user-joined', (d: any) => {
    if (String(d.userId) !== String(uid)) {
      ou.set(String(d.userId), { username: d.username, status: 'online', joinedAt: new Date() });
      ps.setStatus(d.userId, 'online');
      uut();
      asm(`${d.username} joined the room`);
      aa(`${d.username} joined`);
      aud.onJoin();
    }
  });

  sock.on('room:user-left', (d: any) => {
    if (String(d.userId) !== String(uid)) {
      ou.delete(String(d.userId));
      uut();
      asm(`${d.username} left the room`);
      aa(`${d.username} left`);
      aud.onLeave();
    }
  });

  sock.on('room:kicked', (d: any) => {
    smd(`{red-fg}You were kicked from ${d.roomName}{/red-fg}\n\nReason: ${d.reason || 'No reason given'}\nBy: ${d.kickedBy}`, () => { ib.focus(); });
    st.currentChannel = '';
    setCrl('');
    usb();
    aud.onError();
  });

  sock.on('room:error', (d: any) => {
    const em = typeof d === 'string' ? d : (d.error || d.message || 'An error occurred');
    smd(`{red-fg}Error{/red-fg}\n\n${em}`, () => { ib.focus(); s.render(); });
    aud.onError();
  });
}
