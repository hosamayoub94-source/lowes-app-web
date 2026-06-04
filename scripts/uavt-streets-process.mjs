import fs from 'node:fs';
import readline from 'node:readline';

const quarters = JSON.parse(fs.readFileSync('quarters.json','utf8'));
const qname = new Map(quarters.map(q=>[q.Id, q.Name]));
const districts = JSON.parse(fs.readFileSync('districts.json','utf8'));
const cities = JSON.parse(fs.readFileSync('cities.json','utf8'));
const cityName = new Map(cities.map(c=>[c.Id, c.Name]));
const norm = s => (s||'').toString().trim().toLowerCase().replace('i̇','i');

const index = {};
for (const d of districts) index[norm(cityName.get(d.CityId)||'')+'|'+norm(d.Name)] = d.Id;

const byDist = new Map(); // did -> Map(mahalle -> Set(streets))
const rl = readline.createInterface({ input: fs.createReadStream('streets.csv','utf8'), crlfDelay: Infinity });
let first = true, n=0;
for await (let line of rl) {
  if (first){ first=false; continue; }
  if (!line) continue;
  if (line.charCodeAt(0)===0xFEFF) line=line.slice(1);
  const p = line.split(';');
  if (p.length < 6) continue;
  const qid = +p[1], did = +p[3], name = (p[5]||'').trim();
  if (!name || !did) continue;
  const mah = qname.get(qid);
  if (!mah) continue;
  let dm = byDist.get(did); if(!dm){ dm=new Map(); byDist.set(did,dm); }
  let st = dm.get(mah); if(!st){ st=new Set(); dm.set(mah,st); }
  st.add(name);
  n++;
}
fs.mkdirSync('out',{recursive:true});
let files=0, total=0;
for (const [did, dm] of byDist){
  const obj={};
  for (const [m,st] of dm){ obj[m]=[...st].sort(); total+=st.size; }
  fs.writeFileSync(`out/${did}.json`, JSON.stringify(obj));
  files++;
}
fs.writeFileSync('out/index.json', JSON.stringify(index));
console.log(`mappedStreets=${n} files=${files} indexEntries=${Object.keys(index).length} totalUniq=${total}`);
