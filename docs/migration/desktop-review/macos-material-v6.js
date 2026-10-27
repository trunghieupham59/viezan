// Review 06: source-material mapping, not a native Liquid Glass implementation.
function material6(){const mac=review.platform==='macos';for(const node of document.querySelectorAll('.desktop,.sidebar,.toolbar,#work-strip,#session-panel,#dialog,.wb-review-tools>div')){if(mac)node.setAttribute('data-theme','glass');else node.removeAttribute('data-theme');}if(mac)$('.main').setAttribute('data-theme','graphite');else $('.main').removeAttribute('data-theme');const newChat=$('.chat-column [data-action="newchat"]');if(newChat){newChat.innerHTML=icon('PlusIcon')+'Chat mới <kbd>'+(mac?'⌘ N':'Ctrl N')+'</kbd>';newChat.setAttribute('aria-keyshortcuts',mac?'Meta+N':'Control+N');}const history=$('.chat-column [data-session-action="history-toggle"]');if(history){history.innerHTML=icon('SidebarPanelIcon')+'Lịch sử';}const send=$('.composer .send');if(send){send.disabled=!state.chatDraft.trim();send.setAttribute('aria-label','Gửi tin nhắn');}}
const beforeMaterialRender=render;render=function(){beforeMaterialRender();material6();};
const beforeMaterialDialog=openDialog;openDialog=function(type){beforeMaterialDialog(type);material6();};
document.addEventListener('input',e=>{if(e.target.id==='draft'){const send=$('.composer .send');if(send)send.disabled=!e.target.value.trim();}});
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='n'&&(review.platform==='macos'?e.metaKey:e.ctrlKey)&&!$('#dialog').open&&!e.altKey){e.preventDefault();new5();}});
$('.reviewbar>span').innerHTML='<strong>VIEZAN</strong> / Review 06 <span class="muted">· macOS materials</span>';
render();
