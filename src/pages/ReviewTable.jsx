import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { uploadToCOS, getPresignedUrl, deleteFromCOS, BUCKET, REGION } from '../lib/cos';

export default function ReviewTable() {
  const { projectId, dateId } = useParams();
  const { user, profile, isAdmin } = useAuth();
  const [project, setProject] = useState(null);
  const [shootDate, setShootDate] = useState(null);
  const [items, setItems] = useState([]);
  const [versionsMap, setVersionsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ script_no: '', title: '' });
  const [uploading, setUploading] = useState({});
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [expandedScript, setExpandedScript] = useState({});
  const [scriptTextCache, setScriptTextCache] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, [projectId, dateId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [projRes, dateRes, itemsRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('shoot_dates').select('*').eq('id', dateId).single(),
        supabase.from('script_items').select('*').eq('date_id', dateId).order('script_no'),
      ]);
      setProject(projRes.data);
      setShootDate(dateRes.data);
      const itemsData = itemsRes.data || [];
      setItems(itemsData);

      // 查询所有条目的版本记录
      if (itemsData.length > 0) {
        const itemIds = itemsData.map((i) => i.id);
        const { data: verData } = await supabase
          .from('video_versions')
          .select('*')
          .in('item_id', itemIds)
          .order('version_no', { ascending: false });
        const map = {};
        (verData || []).forEach((v) => {
          if (!map[v.item_id]) map[v.item_id] = [];
          map[v.item_id].push(v);
        });
        setVersionsMap(map);
      } else {
        setVersionsMap({});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveScriptText(itemId) {
    const text = scriptTextCache[itemId] || '';
    try {
      await supabase.from('script_items').update({ script_text: text }).eq('id', itemId);
      setItems(items.map(i => i.id === itemId ? { ...i, script_text: text } : i));
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const [projRes, dateRes, itemsRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('shoot_dates').select('*').eq('id', dateId).single(),
        supabase.from('script_items').select('*').eq('date_id', dateId).order('script_no'),
      ]);
      setProject(projRes.data);
      setShootDate(dateRes.data);
      const itemsData = itemsRes.data || [];
      setItems(itemsData);

      // 查询所有条目的版本记录
      if (itemsData.length > 0) {
        const itemIds = itemsData.map((i) => i.id);
        const { data: verData } = await supabase
          .from('video_versions')
          .select('*')
          .in('item_id', itemIds)
          .order('version_no', { ascending: false });
        const map = {};
        (verData || []).forEach((v) => {
          if (!map[v.item_id]) map[v.item_id] = [];
          map[v.item_id].push(v);
        });
        setVersionsMap(map);
      } else {
        setVersionsMap({});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function addItem() {
    if (!newItem.script_no.trim()) return;
    try {
      const { data, error } = await supabase
        .from('script_items')
        .insert({
          date_id: dateId,
          script_no: newItem.script_no.trim(),
          title: newItem.title.trim(),
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      setItems([...items, data]);
      setNewItem({ script_no: '', title: '' });
      setShowAdd(false);
    } catch (err) {
      alert('添加失败: ' + err.message);
    }
  }

  async function deleteItem(itemId) {
    if (!confirm('确定删除该条目？')) return;
    try {
      // Delete associated video from COS first
      const item = items.find((i) => i.id === itemId);
      if (item?.video_key) {
        try { await deleteFromCOS(item.video_key); } catch (e) { /* ignore */ }
      }
      await supabase.from('script_items').delete().eq('id', itemId);
      setItems(items.filter((i) => i.id !== itemId));
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  }

  async function handleVideoUpload(itemId, file) {
    if (!file.type.startsWith('video/')) {
      alert('请上传视频文件');
      return;
    }

    setUploading((prev) => ({ ...prev, [itemId]: 0 }));

    try {
      // 查询当前最大版本号
      const { data: versions } = await supabase
        .from('video_versions')
        .select('version_no')
        .eq('item_id', itemId)
        .order('version_no', { ascending: false })
        .limit(1);

      const nextVersion = versions?.length > 0 ? versions[0].version_no + 1 : 1;
      const key = `${projectId}/${dateId}/${itemId}/v${nextVersion}/${Date.now()}_${file.name}`;

      const result = await uploadToCOS(file, key, (percent) => {
        setUploading((prev) => ({ ...prev, [itemId]: percent }));
      });

      // 创建版本记录
      const { error: verErr } = await supabase
        .from('video_versions')
        .insert({
          item_id: itemId,
          version_no: nextVersion,
          video_key: result.key,
          video_url: result.url,
          file_name: file.name,
          file_size: file.size,
          uploader_id: user.id,
          uploader_name: profile?.email || user.email,
        });

      if (verErr) throw verErr;

      // 更新 script_items（保留旧字段兼容，同时指向最新版本）
      const { error } = await supabase
        .from('script_items')
        .update({
          video_key: result.key,
          video_url: result.url,
          latest_version: nextVersion,
          uploader_id: user.id,
          uploader_name: profile?.email || user.email,
          status: 'in_review',
        })
        .eq('id', itemId);

      if (error) throw error;
      await fetchData();
    } catch (err) {
      const msg = err?.message || err?.toString?.() || JSON.stringify(err) || '未知错误';
      console.error('上传错误详情:', err);
      alert('上传失败: ' + msg);
    } finally {
      setUploading((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  }

  async function handleDrop(e, itemId) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleVideoUpload(itemId, file);
  }

  async function updateStatus(itemId, status) {
    try {
      await supabase
        .from('script_items')
        .update({ status, reviewed_at: status === 'approved' ? new Date().toISOString() : null })
        .eq('id', itemId);
      await fetchData();
    } catch (err) {
      alert('更新失败: ' + err.message);
    }
  }

  async function updateFinalLink(itemId, link) {
    try {
      await supabase.from('script_items').update({ final_link: link }).eq('id', itemId);
      await fetchData();
    } catch (err) {
      alert('更新失败: ' + err.message);
    }
  }

  async function saveNote(itemId) {
    if (!noteText.trim()) return;
    try {
      const item = items.find((i) => i.id === itemId);
      const notes = item.notes || [];
      const newNote = {
        id: Date.now().toString() + '_' + user.id,
        text: noteText.trim(),
        created_by: user.id,
        created_by_name: profile?.email || user.email,
        created_at: new Date().toISOString(),
      };
      await supabase
        .from('script_items')
        .update({ notes: [...notes, newNote] })
        .eq('id', itemId);
      setEditingNote(null);
      setNoteText('');
      await fetchData();
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  }

  async function deleteNote(itemId, noteId) {
    if (!confirm('确定删除这条意见？')) return;
    try {
      const item = items.find((i) => i.id === itemId);
      const notes = (item.notes || []).filter((n) => n.id !== noteId);
      await supabase.from('script_items').update({ notes }).eq('id', itemId);
      await fetchData();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  }

  async function updateNote(itemId, noteId, newText) {
    if (!newText.trim()) return;
    try {
      const item = items.find((i) => i.id === itemId);
      const notes = (item.notes || []).map((n) =>
        n.id === noteId ? { ...n, text: newText.trim(), edited_at: new Date().toISOString() } : n
      );
      await supabase.from('script_items').update({ notes }).eq('id', itemId);
      await fetchData();
    } catch (err) {
      alert('编辑失败: ' + err.message);
    }
  }

  const statusLabels = {
    pending_upload: '待上传',
    in_review: '审核中',
    approved: '已通过',
    rejected: '不通过',
  };

  const statusColors = {
    pending_upload: '#f5f5f5',
    in_review: '#fef3c7',
    approved: '#dcfce7',
    rejected: '#fee2e2',
  };

  if (loading) return <div style={styles.loading}>加载中...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(`/project/${projectId}`)}>
          ← 返回
        </button>
        <div>
          <h1 style={styles.title}>
            {project?.name} · {shootDate?.shoot_date}
          </h1>
          <p style={styles.subtitle}>审片表</p>
        </div>
        <button style={styles.primaryBtn} onClick={() => setShowAdd(true)}>
          添加条目
        </button>
      </div>

      {showAdd && (
        <div style={styles.addBar}>
          <input
            style={styles.inputSmall}
            placeholder="脚本号"
            value={newItem.script_no}
            onChange={(e) => setNewItem({ ...newItem, script_no: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            autoFocus
          />
          <input
            style={styles.input}
            placeholder="脚本标题"
            value={newItem.title}
            onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
          />
          <button style={styles.btnSmall} onClick={addItem}>确定</button>
          <button style={styles.btnSmallGhost} onClick={() => setShowAdd(false)}>取消</button>
        </div>
      )}

      {items.length === 0 ? (
        <p style={styles.empty}>暂无条目</p>
      ) : (
        <div style={styles.table}>
          {/* Table Header */}
          <div style={styles.tableHeader}>
            <div style={styles.colNo}>脚本号</div>
            <div style={styles.colTitle}>标题</div>
            <div style={styles.colScript}>脚本内容</div>
            <div style={styles.colVideo}>预审片</div>
            <div style={styles.colUploader}>上传者</div>
            <div style={styles.colTime}>上传时间</div>
            <div style={styles.colStatus}>状态</div>
            <div style={styles.colNotes}>修改意见</div>
            <div style={styles.colFinal}>成片链接</div>
            {isAdmin && <div style={styles.colAction}>操作</div>}
          </div>

          {/* Table Rows */}
          {items.map((item) => (
            <div key={item.id} style={styles.tableRow}>
              <div style={styles.colNo}>{item.script_no}</div>
              <div style={styles.colTitle}>{item.title}</div>

              {/* Script Text Column */}
              <div style={styles.colScript}>
                {expandedScript[item.id] ? (
                  <div style={styles.scriptExpand}>
                    <textarea
                      style={styles.scriptTextarea}
                      value={scriptTextCache[item.id] ?? (item.script_text || '')}
                      onChange={(e) => {
                        setScriptTextCache({ ...scriptTextCache, [item.id]: e.target.value });
                      }}
                      placeholder="输入脚本内容..."
                      rows={4}
                    />
                    <div style={styles.noteActions}>
                      <button
                        style={styles.btnMini}
                        onClick={() => handleSaveScriptText(item.id)}
                      >
                        保存
                      </button>
                      <button
                        style={styles.btnMiniGhost}
                        onClick={() => {
                          const next = { ...expandedScript };
                          delete next[item.id];
                          setExpandedScript(next);
                        }}
                      >
                        收起
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    style={styles.addNoteBtn}
                    onClick={() => {
                      setExpandedScript({ ...expandedScript, [item.id]: true });
                      setScriptTextCache({ ...scriptTextCache, [item.id]: item.script_text || '' });
                    }}
                  >
                    {item.script_text ? '展开脚本' : '+ 添加脚本'}
                  </button>
                )}
              </div>

              {/* Video Column */}
              <div style={styles.colVideo}>
                {item.video_key ? (
                  <VideoPlayer
                    item={item}
                    versions={versionsMap[item.id] || []}
                    onUploadNewVersion={(file) => handleVideoUpload(item.id, file)}
                    uploading={uploading[item.id] !== undefined}
                    uploadPercent={uploading[item.id]}
                  />
                ) : (
                  <div
                    style={styles.dropZone}
                    onDrop={(e) => handleDrop(e, item.id)}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    {uploading[item.id] !== undefined ? (
                      <div style={styles.progressBar}>
                        <div
                          style={{
                            ...styles.progressFill,
                            width: `${uploading[item.id]}%`,
                          }}
                        />
                        <span style={styles.progressText}>{uploading[item.id]}%</span>
                      </div>
                    ) : (
                      <label style={styles.uploadLabel}>
                        拖拽上传
                        <input
                          type="file"
                          accept="video/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files[0]) handleVideoUpload(item.id, e.target.files[0]);
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>

              <div style={styles.colUploader}>{item.uploader_name || '-'}</div>
              <div style={styles.colTime}>
                {item.uploader_name
                  ? new Date(item.updated_at).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '-'}
              </div>

              <div style={styles.colStatus}>
                <span
                  style={{
                    ...styles.statusBadge,
                    background: statusColors[item.status] || '#f5f5f5',
                  }}
                >
                  {item.video_key
                    ? statusLabels[item.status] || item.status
                    : '待上传'}
                </span>
              </div>

              {/* Notes Column */}
              <div style={styles.colNotes}>
                {(item.notes || []).map((note, i) => (
                  <NoteItem
                    key={note.id || i}
                    note={note}
                    isOwn={note.created_by === user.id}
                    isAdmin={isAdmin}
                    onDelete={() => deleteNote(item.id, note.id)}
                    onUpdate={(newText) => updateNote(item.id, note.id, newText)}
                  />
                ))}
                {isAdmin && (
                  <div>
                    {editingNote === item.id ? (
                      <div style={styles.noteEdit}>
                        <textarea
                          style={styles.noteTextarea}
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="输入修改意见..."
                          rows={2}
                        />
                        <div style={styles.noteActions}>
                          <button style={styles.btnMini} onClick={() => saveNote(item.id)}>
                            保存
                          </button>
                          <button
                            style={styles.btnMiniGhost}
                            onClick={() => {
                              setEditingNote(null);
                              setNoteText('');
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        style={styles.addNoteBtn}
                        onClick={() => {
                          setEditingNote(item.id);
                          setNoteText('');
                        }}
                      >
                        + 添加修改意见
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Final Link */}
              <div style={styles.colFinal}>
                {item.final_link ? (
                  <a
                    href={item.final_link}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.finalLink}
                  >
                    查看成片
                  </a>
                ) : isAdmin ? (
                  <EditableLink
                    onSave={(link) => updateFinalLink(item.id, link)}
                  />
                ) : (
                  <span style={styles.na}>-</span>
                )}
              </div>

              {/* Admin Actions */}
              {isAdmin && (
                <div style={styles.colAction}>
                  {item.status === 'in_review' && (
                    <>
                      <button
                        style={styles.approveBtn}
                        onClick={() => updateStatus(item.id, 'approved')}
                      >
                        通过
                      </button>
                      <button
                        style={styles.rejectBtn}
                        onClick={() => updateStatus(item.id, 'rejected')}
                      >
                        不通过
                      </button>
                    </>
                  )}
                  {item.status === 'approved' && (
                    <button
                      style={styles.rejectBtn}
                      onClick={() => updateStatus(item.id, 'rejected')}
                    >
                      不通过
                    </button>
                  )}
                  {item.status === 'rejected' && (
                    <button
                      style={styles.approveBtn}
                      onClick={() => updateStatus(item.id, 'approved')}
                    >
                      通过
                    </button>
                  )}
                  {item.status === 'pending_upload' && (
                    <span style={{ fontSize: 12, color: '#aaa' }}>等待上传</span>
                  )}
                  <button
                    style={styles.deleteBtn}
                    onClick={() => deleteItem(item.id)}
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VideoPlayer({ item, versions, onUploadNewVersion, uploading, uploadPercent }) {
  const [activeVersion, setActiveVersion] = useState(null);
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [vidSize, setVidSize] = useState(null); // { w, h }
  const videoRef = useRef(null);
  const probeRef = useRef(null);

  // 默认显示最新版本
  const selected = activeVersion || (versions.length > 0 ? versions[0] : null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setVidSize(null);
      try {
        const key = selected?.video_key || item.video_key;
        const presigned = await getPresignedUrl(key);
        if (!cancelled) {
          setUrl(presigned);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selected?.video_key || item.video_key]);

  // 探测视频尺寸（后台更新比例）
  function handleProbeMeta() {
    const v = probeRef.current;
    if (v && v.videoWidth && v.videoHeight) {
      setVidSize({ w: v.videoWidth, h: v.videoHeight });
    }
  }

  function handleExpand(e) {
    e.preventDefault();
    e.stopPropagation();
    setExpanded(true);
  }

  function handleClose(e) {
    e.stopPropagation();
    setExpanded(false);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }

  if (loading) return <div style={styles.videoLoading}>加载预览...</div>;
  if (!url) return <div style={styles.videoError}>加载失败</div>;

  // 按视频比例计算缩略图容器尺寸（最大 200x150）
  const MAX_W = 200, MAX_H = 150;
  let thumbW = MAX_W, thumbH = MAX_H;
  if (vidSize) {
    const ratio = vidSize.w / vidSize.h;
    if (ratio > MAX_W / MAX_H) {
      // 更宽：限制宽度
      thumbW = MAX_W;
      thumbH = Math.round(MAX_W / ratio);
    } else {
      // 更高：限制高度
      thumbH = MAX_H;
      thumbW = Math.round(MAX_H * ratio);
    }
  }

  const thumbStyle = { width: thumbW, height: thumbH, objectFit: 'contain', borderRadius: 8, background: '#000' };

  return (
    <>
      {/* 隐藏探测器：获取视频真实尺寸 */}
      {!vidSize && (
        <video
          ref={probeRef}
          src={url}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          preload="metadata"
          onLoadedMetadata={handleProbeMeta}
        />
      )}

      <div style={styles.videoCell}>
        {/* 缩略图 */}
        <video
          src={url}
          muted
          style={{ ...thumbStyle, cursor: 'pointer' }}
          preload="metadata"
          onClick={handleExpand}
          title="点击放大播放"
        />

        {/* 版本切换 + 上传新版本 */}
        <div style={styles.versionRow}>
          {versions.length >= 1 && (
            <select
              style={styles.versionSelect}
              value={selected?.version_no || ''}
              onChange={(e) => {
                const v = versions.find((v) => v.version_no === Number(e.target.value));
                if (v) setActiveVersion(v);
              }}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.version_no}>
                  v{v.version_no}
                </option>
              ))}
            </select>
          )}
          <label style={styles.uploadNewBtn}>
            上传新版
            <input
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files[0]) onUploadNewVersion(e.target.files[0]);
              }}
            />
          </label>
        </div>

        {/* 上传进度 */}
        {uploading && (
          <div style={styles.miniProgress}>
            <div style={{ ...styles.miniProgressFill, width: `${uploadPercent}%` }} />
            <span style={styles.miniProgressText}>{Math.round(uploadPercent)}%</span>
          </div>
        )}
      </div>

      {/* 大屏播放层 */}
      {expanded && (
        <div style={styles.overlay} onClick={handleClose}>
          <div style={styles.overlayContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.overlayHeader}>
              {versions.length > 1 && (
                <select
                  style={styles.versionSelectOverlay}
                  value={selected?.version_no || ''}
                  onChange={(e) => {
                    const v = versions.find((v) => v.version_no === Number(e.target.value));
                    if (v) setActiveVersion(v);
                  }}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.version_no}>
                      v{v.version_no}
                    </option>
                  ))}
                </select>
              )}
              <button style={styles.closeBtn} onClick={handleClose}>✕</button>
            </div>
            <video
              ref={videoRef}
              src={url}
              controls
              autoPlay
              style={styles.expandedVideo}
            />
          </div>
        </div>
      )}
    </>
  );
}

function NoteItem({ note, isOwn, isAdmin, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const canModify = isOwn || isAdmin;

  function handleSave() {
    if (text.trim() && text.trim() !== note.text) {
      onUpdate(text);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={styles.noteItem}>
        <textarea
          style={styles.noteTextarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          autoFocus
        />
        <div style={styles.noteActions}>
          <button style={styles.btnMini} onClick={handleSave}>保存</button>
          <button style={styles.btnMiniGhost} onClick={() => { setEditing(false); setText(note.text); }}>取消</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.noteItem}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={styles.noteAuthor}>{note.created_by_name}</span>
          <span style={styles.noteTime}>
            {new Date(note.created_at).toLocaleString('zh-CN', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
            {note.edited_at ? ' (已编辑)' : ''}
          </span>
        </div>
        {canModify && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              style={styles.noteActionBtn}
              onClick={() => { setEditing(true); setText(note.text); }}
              title="编辑"
            >
              编辑
            </button>
            <button
              style={{ ...styles.noteActionBtn, color: '#dc2626' }}
              onClick={onDelete}
              title="删除"
            >
              删除
            </button>
          </div>
        )}
      </div>
      <p style={styles.noteText}>{note.text}</p>
    </div>
  );
}

function EditableLink({ onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  function handleSave() {
    if (value.trim()) {
      onSave(value.trim());
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <button style={styles.addLinkBtn} onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.focus(), 100); }}>
        + 添加链接
      </button>
    );
  }

  return (
    <div style={styles.linkEdit}>
      <input
        ref={inputRef}
        style={styles.linkInput}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="百度网盘链接..."
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
      />
      <button style={styles.btnMini} onClick={handleSave}>保存</button>
      <button style={styles.btnMiniGhost} onClick={() => setEditing(false)}>取消</button>
    </div>
  );
}

const styles = {
  container: { maxWidth: '100%', margin: '0 auto', padding: '40px 24px' },
  loading: { textAlign: 'center', color: '#aaa', marginTop: 60 },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 32, flexWrap: 'wrap', gap: 16,
  },
  backBtn: {
    padding: '8px 16px', background: '#f5f5f5', border: '1px solid #e0e0e0',
    borderRadius: 8, fontSize: 13, color: '#555', cursor: 'pointer',
  },
  title: { fontSize: 24, fontWeight: 600, color: '#1a1a1a', margin: 0 },
  subtitle: { fontSize: 13, color: '#888', margin: '4px 0 0 0' },
  primaryBtn: {
    padding: '8px 16px', background: '#1a1a1a', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
  addBar: {
    display: 'flex', gap: 8, marginBottom: 24, padding: '16px 20px',
    background: '#fafafa', borderRadius: 12, border: '1px solid #eee',
  },
  input: { flex: 1, padding: '8px 14px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none' },
  inputSmall: { width: 120, padding: '8px 14px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none' },
  btnSmall: { padding: '8px 16px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  btnSmallGhost: { padding: '8px 16px', background: '#fff', color: '#666', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 60, fontSize: 14 },

  // Table
  table: { border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', background: '#fff' },
  tableHeader: {
    display: 'flex', padding: '14px 16px', background: '#fafafa',
    borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 600, color: '#888',
  },
  tableRow: {
    display: 'flex', padding: '16px', borderBottom: '1px solid #f5f5f5',
    alignItems: 'flex-start', fontSize: 13,
  },
  colNo: { width: 80, flexShrink: 0 },
  colTitle: { width: 100, flexShrink: 0, fontWeight: 500 },
  colScript: { width: 100, flexShrink: 0 },
  colVideo: { width: 200, flexShrink: 0 },
  colUploader: { width: 90, flexShrink: 0, color: '#666', fontSize: 12, wordBreak: 'break-all' },
  colTime: { width: 120, flexShrink: 0, color: '#888', fontSize: 12 },
  colStatus: { width: 80, flexShrink: 0 },
  colNotes: { flex: 1, minWidth: 200 },
  colFinal: { width: 130, flexShrink: 0 },
  colAction: { width: 140, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 },

  // Video
  dropZone: {
    width: 180, height: 100, border: '2px dashed #ddd', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#fafafa', cursor: 'pointer',
  },
  uploadLabel: { fontSize: 13, color: '#aaa', cursor: 'pointer' },
  progressBar: {
    width: '100%', height: 8, background: '#eee', borderRadius: 4,
    position: 'relative', overflow: 'hidden',
  },
  progressFill: {
    height: '100%', background: '#1a1a1a', borderRadius: 4, transition: 'width 0.3s',
  },
  progressText: {
    position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
    fontSize: 11, color: '#888',
  },
  video: { maxWidth: 200, maxHeight: 150, width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 8, background: '#000' },
  videoCell: { display: 'flex', flexDirection: 'column', gap: 4 },
  videoLoading: { fontSize: 12, color: '#aaa', padding: '40px 0', textAlign: 'center' },
  videoError: { fontSize: 12, color: '#dc2626', padding: '40px 0', textAlign: 'center' },

  // Version row
  versionRow: {
    display: 'flex', gap: 4, alignItems: 'center',
  },
  versionSelect: {
    flex: 1, padding: '2px 4px', border: '1px solid #e0e0e0',
    borderRadius: 4, fontSize: 11, color: '#888', background: '#fff',
    outline: 'none',
  },
  uploadNewBtn: {
    padding: '2px 6px', background: 'transparent', border: '1px solid #e0e0e0',
    borderRadius: 4, fontSize: 10, color: '#888', cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  miniProgress: {
    width: '100%', height: 4, background: '#eee', borderRadius: 2,
    position: 'relative', overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%', background: '#1a1a1a', borderRadius: 2, transition: 'width 0.3s',
  },
  miniProgressText: {
    position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
    fontSize: 10, color: '#888',
  },
  versionSelectOverlay: {
    padding: '4px 10px', border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 6, fontSize: 13, color: '#fff', background: 'rgba(255,255,255,0.15)',
    outline: 'none',
  },

  // Expanded video overlay
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  overlayContent: {
    position: 'relative',
    width: '90vw', maxWidth: 1200, maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    cursor: 'default',
  },
  overlayHeader: {
    width: '100%', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12, gap: 12,
  },
  expandedVideo: {
    width: '100%', maxHeight: '90vh', objectFit: 'contain',
    borderRadius: 8, background: '#000',
  },
  closeBtn: {
    width: 36, height: 36,
    background: 'rgba(255,255,255,0.2)', color: '#fff',
    border: 'none', borderRadius: '50%',
    fontSize: 18, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  // Status
  statusBadge: { padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500 },

  // Notes
  noteItem: {
    padding: '8px 10px', background: '#fafafa', borderRadius: 6,
    marginBottom: 6, border: '1px solid #f0f0f0',
  },
  noteAuthor: { fontSize: 12, fontWeight: 600, color: '#1a1a1a' },
  noteTime: { fontSize: 11, color: '#aaa', marginLeft: 8 },
  noteText: { margin: '4px 0 0 0', fontSize: 13, color: '#555' },
  noteEdit: { marginTop: 6 },
  noteTextarea: {
    width: '100%', padding: '8px', border: '1px solid #e0e0e0', borderRadius: 6,
    fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box',
  },
  noteActions: { display: 'flex', gap: 6, marginTop: 6 },
  addNoteBtn: {
    padding: '6px 12px', background: 'transparent', border: '1px solid #e0e0e0',
    borderRadius: 6, fontSize: 12, color: '#888', cursor: 'pointer',
  },
  noteActionBtn: {
    padding: '2px 6px', background: 'transparent', border: '1px solid #e0e0e0',
    borderRadius: 4, fontSize: 11, color: '#888', cursor: 'pointer',
  },

  // Final Link
  finalLink: { fontSize: 13, color: '#2563eb' },
  na: { color: '#ccc' },
  addLinkBtn: {
    padding: '4px 10px', background: 'transparent', border: '1px solid #e0e0e0',
    borderRadius: 6, fontSize: 12, color: '#888', cursor: 'pointer',
  },
  linkEdit: { display: 'flex', flexDirection: 'column', gap: 4 },
  linkInput: {
    width: '100%', padding: '4px 8px', border: '1px solid #e0e0e0', borderRadius: 6,
    fontSize: 12, outline: 'none', boxSizing: 'border-box',
  },

  // Actions
  approveBtn: {
    padding: '4px 12px', background: '#16a34a', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },
  rejectBtn: {
    padding: '4px 12px', background: '#dc2626', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },
  deleteBtn: {
    padding: '4px 12px', background: 'transparent', border: '1px solid #fecaca',
    borderRadius: 6, color: '#dc2626', fontSize: 12, cursor: 'pointer',
  },
  // Script text expand
  scriptExpand: {
    padding: '4px 0',
  },
  scriptTextarea: {
    width: '100%',
    padding: '8px',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    minHeight: 80,
  },

  btnMini: {
    padding: '4px 10px', background: '#1a1a1a', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },
  btnMiniGhost: {
    padding: '4px 10px', background: '#fff', color: '#666',
    border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },
};
