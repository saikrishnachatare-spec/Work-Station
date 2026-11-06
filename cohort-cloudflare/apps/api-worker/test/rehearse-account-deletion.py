"""LOCAL ONLY design rehearsal. Never called by worker or shipped as endpoint.
Broader scrub than0057 is a proposed privacy fix, not approved live policy.
"""
import sqlite3
from pathlib import Path
DB=sqlite3.connect(':memory:')
DB.execute('PRAGMA foreign_keys=ON')
for f in sorted((Path(__file__).parent.parent/'migrations').glob('*.sql')):DB.executescript(f.read_text())
DB.executescript("""
INSERT INTO profiles(id,full_name,headline,bio,org_name,city,links,skills,experience,education) VALUES('victim','Private Name','private headline','private bio','private org','private city','[{"url":"private"}]','["private"]','[{"org":"private"}]','[{"institute":"private"}]');
INSERT INTO profiles(id,full_name,role) VALUES('admin','Admin','admin'),('successor','Next admin','user'),('ordinary','Ordinary','user');
INSERT INTO profile_contacts VALUES('victim','1234567890');
INSERT INTO groups(id,name,created_by) VALUES('g_shared','Group','victim'),('g_empty','Empty','victim');
INSERT INTO group_members(group_id,user_id,role,created_at) VALUES('g_shared','victim','admin','2020-01-01'),('g_shared','ordinary','member','2020-01-02'),('g_shared','successor','admin','2020-01-03');
INSERT INTO posts(id,author_id,author_name,body) VALUES('p','victim','Private Name','Shared content');
INSERT INTO student_notes(id,title,owner_id,uploader_name) VALUES('n','Shared note','victim','Private Name');
INSERT INTO threads(id) VALUES('dm');
INSERT INTO thread_participants(thread_id,user_id) VALUES('dm','victim'),('dm','ordinary');
INSERT INTO messages(id,thread_id,sender_id,body) VALUES('m','dm','victim','Shared message');
INSERT INTO jobs(id,firm,role,posted_by) VALUES('j','Firm','Role','victim');
INSERT INTO applications(id,job_id,user_id) VALUES('app','j','ordinary');
INSERT INTO connections(id,requester_id,addressee_id) VALUES('c','victim','ordinary');
INSERT INTO notifications(id,user_id,kind) VALUES('notify','victim','system');
INSERT INTO error_logs(id,user_id,message) VALUES('e','victim','opaque diagnostic');
""")

def delete(uid,files_clean=False,identity_deleted=False,simulate_failure=False):
    # In real workflow verified service outcomes, not caller-supplied booleans.
    if not files_clean or not identity_deleted:raise RuntimeError('prerequisites_unverified')
    with DB:
        p=DB.execute('SELECT role,status FROM profiles WHERE id=?',(uid,)).fetchone()
        if p==('admin','active') and not DB.execute("SELECT 1 FROM profiles WHERE role='admin' AND status='active' AND id<>?",(uid,)).fetchone():raise RuntimeError('last_admin')
        old=DB.execute('SELECT full_name FROM profiles WHERE id=?',(uid,)).fetchone()[0]
        DB.execute("UPDATE posts SET author_name='Former member' WHERE author_id=?",(uid,))
        DB.execute("UPDATE resources SET uploaded_by='Former member' WHERE owner_id=?",(uid,))
        # Proposed extension: all profile-richness fields and note uploader name.
        DB.execute("UPDATE student_notes SET uploader_name='Former member' WHERE owner_id=?",(uid,))
        DB.execute("UPDATE activity_log SET actor_name='',detail='{}' WHERE actor_id=?",(uid,))
        DB.execute("UPDATE activity_log SET detail=json_set(detail,'$.member','Former member') WHERE json_extract(detail,'$.member')=?",(old,))
        DB.execute("UPDATE trash SET trashed_by_name='Former member' WHERE trashed_by=?",(uid,))
        for table,key,col in [('posts','author_id','author_name'),('resources','owner_id','uploaded_by'),('jobs','posted_by','firm')]:
            DB.execute("UPDATE trash SET payload=json_set(payload,?,'Former member') WHERE entity_table=? AND json_extract(payload,?)=?",('$.'+col,table,'$.'+key,uid))
        for row in DB.execute("SELECT id,payload FROM trash WHERE entity_table='jobs' AND json_type(payload,'$._applications')='array'").fetchall():
            import json
            payload=json.loads(row[1]);payload['_applications']=[a for a in payload['_applications'] if a.get('user_id')!=uid];DB.execute('UPDATE trash SET payload=? WHERE id=?',(json.dumps(payload),row[0]))
        DB.execute('DELETE FROM jobs WHERE posted_by=?',(uid,))
        for table,col in [('group_members','user_id'),('thread_participants','user_id'),('group_invites','created_by'),('content_reports','reporter_id'),('applications','user_id'),('job_alert_prefs','user_id'),('notifications','user_id'),('profile_contacts','user_id'),('verification_requests','user_id'),('screen_view_windows','actor_id')]:DB.execute(f'DELETE FROM {table} WHERE {col}=?',(uid,))
        DB.execute('DELETE FROM user_blocks WHERE blocker_id=? OR blocked_id=?',(uid,uid))
        DB.execute('DELETE FROM connections WHERE requester_id=? OR addressee_id=?',(uid,uid))
        DB.execute('UPDATE error_logs SET user_id=NULL WHERE user_id=?',(uid,))
        for (gid,) in DB.execute('SELECT id FROM groups WHERE created_by=?',(uid,)).fetchall():
            next=DB.execute("SELECT user_id FROM group_members WHERE group_id=? ORDER BY (role='admin') DESC,created_at,user_id LIMIT 1",(gid,)).fetchone()
            if next:
                DB.execute('UPDATE groups SET created_by=? WHERE id=?',(next[0],gid));DB.execute("UPDATE group_members SET role='admin' WHERE group_id=? AND user_id=?",(gid,next[0]))
            else:DB.execute('DELETE FROM groups WHERE id=?',(gid,))
        DB.execute("UPDATE groups SET member_count=(SELECT count(*) FROM group_members WHERE group_id=groups.id)")
        DB.execute("UPDATE profiles SET full_name='Former member',course='',level='',avatar_path=NULL,role='user',status='deleted',verified_at=NULL,headline='',bio='',org_name='',city='',links='[]',skills='[]',experience='[]',education='[]' WHERE id=?",(uid,))
        if simulate_failure:raise RuntimeError('simulated_mid_transaction_failure')

passed=0
def check(name,value):
 global passed
 assert value,name
 passed+=1;print('PASS',name)
for options in [{},{'files_clean':True}]:
 try:delete('victim',**options);raise AssertionError('missing prereq accepted')
 except RuntimeError:pass
check('no verified prerequisites leaves profile intact',DB.execute("SELECT full_name FROM profiles WHERE id='victim'").fetchone()[0]=='Private Name')
try:delete('admin',True,True);raise AssertionError('last admin deleted')
except RuntimeError:pass
check('last admin intact',DB.execute("SELECT role FROM profiles WHERE id='admin'").fetchone()[0]=='admin')
try:delete('victim',True,True,True);raise AssertionError('rollback absent')
except RuntimeError:pass
check('mid transaction rollback restores identity',DB.execute("SELECT full_name FROM profiles WHERE id='victim'").fetchone()[0]=='Private Name')
check('rollback restores connections',DB.execute("SELECT count(*) FROM connections WHERE id='c'").fetchone()[0]==1)
delete('victim',True,True)
check('deleted status tombstone',DB.execute("SELECT status,full_name FROM profiles WHERE id='victim'").fetchone()==('deleted','Former member'))
check('rich profile cleared',DB.execute("SELECT bio,headline,org_name,city,links FROM profiles WHERE id='victim'").fetchone()==('','','','','[]'))
for table in ['profile_contacts','connections']:
 check(table+' removed',DB.execute('SELECT count(*) FROM '+table).fetchone()[0]==0)
check('own notifications removed',DB.execute("SELECT count(*) FROM notifications WHERE user_id='victim'").fetchone()[0]==0)
check('shared post retained anonymised',DB.execute("SELECT body,author_name FROM posts WHERE id='p'").fetchone()==('Shared content','Former member'))
check('shared note uploader anonymised',DB.execute("SELECT uploader_name FROM student_notes WHERE id='n'").fetchone()[0]=='Former member')
check('shared message retained',DB.execute("SELECT body FROM messages WHERE id='m'").fetchone()[0]=='Shared message')
check('owned jobs and dependent applications removed',DB.execute('SELECT count(*) FROM jobs').fetchone()[0]==0 and DB.execute('SELECT count(*) FROM applications').fetchone()[0]==0)
check('group existing admin before oldest member',DB.execute("SELECT created_by FROM groups WHERE id='g_shared'").fetchone()[0]=='successor')
check('empty owned group removed',DB.execute("SELECT count(*) FROM groups WHERE id='g_empty'").fetchone()[0]==0)
check('private error identity removed',DB.execute("SELECT user_id FROM error_logs WHERE id='e'").fetchone()[0] is None)
check('foreign keys clean',DB.execute('PRAGMA foreign_key_check').fetchall()==[])
print(f'account deletion design rehearsal: {passed} passed')
