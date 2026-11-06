-- No guessed historical events. These triggers record only future changes.
CREATE TABLE controlled_test_accounts(user_id TEXT PRIMARY KEY,note TEXT NOT NULL DEFAULT '');
CREATE INDEX activity_actor_action_entity_created ON activity_log(actor_id,action,entity_id,created_at);
CREATE TABLE screen_view_windows(actor_id TEXT NOT NULL,screen TEXT NOT NULL,last_at TEXT NOT NULL,PRIMARY KEY(actor_id,screen));
CREATE TRIGGER activity_post AFTER INSERT ON posts BEGIN
 INSERT INTO activity_log(id,actor_id,actor_name,action,entity_type,entity_id,detail)
 VALUES(lower(hex(randomblob(16))),new.author_id,new.author_name,'post_created','posts',new.id,json_object('excerpt',substr(new.body,1,120),'kind',new.kind));
END;
CREATE TRIGGER activity_job AFTER INSERT ON jobs BEGIN
 INSERT INTO activity_log(id,actor_id,actor_name,action,entity_type,entity_id,detail)
 VALUES(lower(hex(randomblob(16))),new.posted_by,COALESCE((SELECT full_name FROM profiles WHERE id=new.posted_by),''),'opening_posted','jobs',new.id,json_object('role',new.role,'firm',new.firm,'cat',new.cat));
END;
CREATE TRIGGER activity_resource AFTER INSERT ON resources BEGIN
 INSERT INTO activity_log(id,actor_id,actor_name,action,entity_type,entity_id,detail)
 VALUES(lower(hex(randomblob(16))),new.owner_id,new.uploaded_by,'resource_shared','resources',new.id,json_object('title',new.title));
END;
CREATE TRIGGER activity_group AFTER INSERT ON groups BEGIN
 INSERT INTO activity_log(id,actor_id,actor_name,action,entity_type,entity_id,detail)
 VALUES(lower(hex(randomblob(16))),new.created_by,COALESCE((SELECT full_name FROM profiles WHERE id=new.created_by),''),'group_created','groups',new.id,json_object('name',new.name));
END;
CREATE TRIGGER activity_application AFTER INSERT ON applications BEGIN
 INSERT INTO activity_log(id,actor_id,actor_name,action,entity_type,entity_id,detail)
 SELECT lower(hex(randomblob(16))),new.user_id,COALESCE((SELECT full_name FROM profiles WHERE id=new.user_id),''),'application_sent','applications',new.id,json_object('role',j.role,'firm',j.firm,'applicant',COALESCE((SELECT full_name FROM profiles WHERE id=new.user_id),'')) FROM jobs j WHERE j.id=new.job_id;
END;
CREATE TRIGGER activity_membership AFTER INSERT ON group_members BEGIN
 INSERT INTO activity_log(id,actor_id,actor_name,action,entity_type,entity_id,detail)
 SELECT lower(hex(randomblob(16))),new.user_id,COALESCE((SELECT full_name FROM profiles WHERE id=new.user_id),''),'member_added','group_members',new.group_id,json_object('member',COALESCE((SELECT full_name FROM profiles WHERE id=new.user_id),''),'group',g.name) FROM groups g WHERE g.id=new.group_id;
END;
CREATE TRIGGER activity_signup AFTER INSERT ON profiles BEGIN
 INSERT INTO activity_log(id,actor_id,actor_name,action,entity_type,entity_id,detail)
 VALUES(lower(hex(randomblob(16))),new.id,new.full_name,'signup','profile',new.id,json_object('account_type',new.account_type,'org_name',new.org_name,'course',new.course,'level',new.level));
END;
CREATE TRIGGER screen_window_insert AFTER INSERT ON screen_view_windows BEGIN
 INSERT INTO activity_log(id,actor_id,actor_name,action,entity_type,entity_id)
 VALUES(lower(hex(randomblob(16))),new.actor_id,COALESCE((SELECT full_name FROM profiles WHERE id=new.actor_id),''),'screen_view','screen',new.screen);
END;
CREATE TRIGGER screen_window_update AFTER UPDATE OF last_at ON screen_view_windows BEGIN
 INSERT INTO activity_log(id,actor_id,actor_name,action,entity_type,entity_id)
 VALUES(lower(hex(randomblob(16))),new.actor_id,COALESCE((SELECT full_name FROM profiles WHERE id=new.actor_id),''),'screen_view','screen',new.screen);
END;
