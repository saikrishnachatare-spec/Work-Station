-- Atomic in-app notification creation, mirroring0050/0053/0055/0056/0059.
-- No browser push/email/SMS: clients fetch recipient-only rows every60s.
CREATE UNIQUE INDEX notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key <> '';
CREATE TRIGGER notify_comment AFTER INSERT ON comments BEGIN
  INSERT OR IGNORE INTO notifications(id,user_id,kind,title,body,link,dedupe_key)
  SELECT lower(hex(randomblob(16))),p.author_id,'comment',
    substr(COALESCE(NULLIF(trim(a.full_name),''),'Someone') || ' replied to your post',1,140),
    substr(new.body,1,500),'/post?id='||new.post_id,
    'cmt:'||new.post_id||':'||p.author_id||':'||strftime('%Y%m%d%H','now')
  FROM posts p JOIN profiles recipient ON recipient.id=p.author_id
  LEFT JOIN profiles a ON a.id=new.author_id
  WHERE p.id=new.post_id AND p.author_id<>new.author_id AND recipient.status='active';
END;
CREATE TRIGGER notify_message AFTER INSERT ON messages BEGIN
  INSERT OR IGNORE INTO notifications(id,user_id,kind,title,body,link,dedupe_key)
  SELECT lower(hex(randomblob(16))),r.id,'message',
    substr(COALESCE(NULLIF(trim(a.full_name),''),'Someone') ||
      CASE WHEN t.group_id IS NULL THEN ' sent you a message' ELSE ' posted in a group you are in' END,1,140),
    substr(new.body,1,500),'/messages',
    'msg:'||new.thread_id||':'||r.id||':'||strftime('%Y%m%d%H','now')
  FROM threads t JOIN profiles r ON r.status='active' LEFT JOIN profiles a ON a.id=new.sender_id
  WHERE t.id=new.thread_id AND r.id<>new.sender_id
    AND ((t.group_id IS NULL AND EXISTS(SELECT 1 FROM thread_participants tp WHERE tp.thread_id=t.id AND tp.user_id=r.id))
      OR (t.group_id IS NOT NULL AND EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=t.group_id AND gm.user_id=r.id)))
    AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=new.sender_id AND b.blocked_id=r.id) OR (b.blocker_id=r.id AND b.blocked_id=new.sender_id));
END;
CREATE TRIGGER notify_connection_request AFTER INSERT ON connections BEGIN
  INSERT OR IGNORE INTO notifications(id,user_id,kind,title,body,link,dedupe_key)
  SELECT lower(hex(randomblob(16))),r.id,'connection_request',
    substr(COALESCE(NULLIF(trim(a.full_name),''),'Someone')||' wants to connect',1,140),
    'Accept to message each other and add one another to groups.','/connections','conn-req:'||new.id
  FROM profiles r LEFT JOIN profiles a ON a.id=new.requester_id WHERE r.id=new.addressee_id AND r.status='active';
END;
CREATE TRIGGER notify_connection_accept AFTER UPDATE OF status ON connections WHEN old.status='pending' AND new.status='accepted' BEGIN
  INSERT OR IGNORE INTO notifications(id,user_id,kind,title,body,link,dedupe_key)
  SELECT lower(hex(randomblob(16))),r.id,'connection_accepted',
    substr(COALESCE(NULLIF(trim(a.full_name),''),'Someone')||' accepted your request',1,140),
    'You can now message each other and add one another to groups.','/connections','conn-acc:'||new.id
  FROM profiles r LEFT JOIN profiles a ON a.id=new.addressee_id WHERE r.id=new.requester_id AND r.status='active';
END;
CREATE TRIGGER notify_application_status AFTER UPDATE OF status ON applications WHEN new.status<>old.status BEGIN
  INSERT OR IGNORE INTO notifications(id,user_id,kind,title,body,link,dedupe_key)
  SELECT lower(hex(randomblob(16))),r.id,'application_status',substr('Application update: '||COALESCE(j.role,'an opening'),1,140),
    substr('Your application to '||COALESCE(j.firm,'a firm')||' for '||COALESCE(j.role,'an opening')||' '||
      CASE new.status WHEN 'reviewed' THEN 'is being reviewed' WHEN 'shortlisted' THEN '- you are shortlisted' WHEN 'rejected' THEN 'was not selected' ELSE 'was updated' END||'.',1,500),
    '/work','app:'||new.id||':'||new.status
  FROM profiles r LEFT JOIN jobs j ON j.id=new.job_id WHERE r.id=new.user_id AND r.status='active';
END;
CREATE TRIGGER notify_verification AFTER UPDATE OF status ON verification_requests WHEN old.status='pending' AND new.status IN('approved','rejected') BEGIN
  INSERT OR IGNORE INTO notifications(id,user_id,kind,title,body,link,dedupe_key)
  SELECT lower(hex(randomblob(16))),r.id,'application_status',
    CASE new.status WHEN 'approved' THEN 'You are now a verified professional' ELSE 'Verification request declined' END,
    CASE new.status WHEN 'approved' THEN 'Your profile shows the verified badge and you can post job openings.' ELSE 'The team could not verify the profile yet. Add more detail to your profile and request again.' END,
    '/account','verify:'||new.id FROM profiles r WHERE r.id=new.user_id AND r.status='active';
END;
CREATE TRIGGER notify_error_digest AFTER INSERT ON error_logs BEGIN
  INSERT OR IGNORE INTO notifications(id,user_id,kind,title,body,link,dedupe_key)
  SELECT lower(hex(randomblob(16))),r.id,'system','New app errors today',
    substr((SELECT count(*) FROM error_logs WHERE created_at>=date('now'))||CASE WHEN (SELECT count(*) FROM error_logs WHERE created_at>=date('now'))=1 THEN ' error logged today. Latest: ' ELSE ' errors logged today. Latest: ' END||substr(new.message,1,200),1,500),
    '/admin','errdigest:'||date('now')||':'||r.id FROM profiles r WHERE r.role='admin' AND r.status='active';
END;
-- Job-match tokenization is evaluated by worker within the job INSERT batch;
-- SQLite has no source regexp_split_to_array equivalent. See notifications.ts.
