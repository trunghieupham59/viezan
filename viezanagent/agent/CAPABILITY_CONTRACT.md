# Agent Capability Contract

Moi purpose agent trong `viezanagent/agent/` phai chay theo capability graph da khai bao, khong duoc tu tao quy trinh ad hoc khi repo da co rule, skill hoac workflow phu hop.

## Relationship Model

```text
agent
  -> primary_workflow / primary_workflows
    -> workflow rules
    -> workflow skills
    -> related_workflows / gate workflows
      -> skill references
      -> rule references
  -> outputs / reports
```

Y nghia tung layer:

- `agent`: chon muc dich cong viec, scope, gate bat buoc va output contract.
- `workflow`: orchestration theo buoc, command/report path va gate policy.
- `skill`: rubric, checklist, severity model, false-positive rules va domain knowledge.
- `rule`: guardrail nen khi doc code, sua code, audit va verify.
- `report`: bang chung da chay capability nao, ket qua, blocker va remaining queue.

## Required Behavior

1. Doc JSON cua agent truoc, resolve `primary_workflow` hoac `primary_workflows`.
2. Resolve tat ca path trong `capabilities.rules`, `capabilities.skills`, `capabilities.workflows` va cac `references`.
3. Doc workflow chinh va skill/rule lien quan truoc khi phan tich hoac sua file.
4. Chi dung capability da khai bao trong agent hoac duoc workflow chinh link truc tiep/gian tiep.
5. Neu can capability moi, cap nhat registry agent/workflow/skill/rule truoc hoac bao `Capability Drift`.
6. Report cuoi phai ghi ro rule, skill va workflow da dung; gate nao khong chay phai co `Not run`/`Blocked` kem ly do.

## Validation

Sau khi sua agent, workflow, skill hoac rule:

```bash
node -e "const fs=require('fs');const path=require('path');let n=0;function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.json')){JSON.parse(fs.readFileSync(p,'utf8'));n++;}}}walk('viezanagent');console.log('json_files '+n+' ok')"
```

```bash
node -e "const fs=require('fs');const path=require('path');const files=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.json'))files.push(p);}}walk('viezanagent');const refs=[];function scan(o,file){if(Array.isArray(o)){for(const v of o)scan(v,file);return;}if(!o||typeof o!=='object')return;for(const [k,v] of Object.entries(o)){if(typeof v==='string'&&v.startsWith('../'))refs.push([file,k,v]);if(Array.isArray(v))for(const x of v)if(typeof x==='string'&&x.startsWith('../'))refs.push([file,k,x]);scan(v,file);}}for(const f of files)scan(JSON.parse(fs.readFileSync(f,'utf8')),f);const broken=refs.filter(([f,,r])=>!fs.existsSync(path.resolve(path.dirname(f),r)));if(broken.length){console.error(broken.map(x=>x.join(' ')).join('\\n'));process.exit(1);}console.log('checked_refs '+refs.length+' ok')"
```
