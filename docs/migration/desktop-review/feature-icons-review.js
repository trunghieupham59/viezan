// Semantic navigation mappings, independent of platform material.
pages.find(p=>p[0]==='interpret')[2]='InterpretFeatureIcon';
pages.find(p=>p[0]==='apps')[2]='AppsFeatureIcon';
settingsMeta7.appearance[2]='PaletteIcon';
settingsMeta7.about[2]='InfoCircleIcon';
for(const work of recentWork){if(work[0]==='interpret')work[5]='InterpretFeatureIcon';}
const beforeFeatureIcons=render;
render=function(){beforeFeatureIcons();document.querySelectorAll('[data-page="interpret"] svg.feature-symbol').forEach(svg=>{svg.outerHTML=icon('InterpretFeatureIcon');});};
render();
$('.reviewbar>span').innerHTML='<strong>VIEZAN</strong> / Review 08 <span class="muted">· Icon tính năng</span>';
