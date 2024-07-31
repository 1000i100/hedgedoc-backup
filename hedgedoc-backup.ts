import {readFileSync,writeFileSync,mkdirSync,statSync} from 'fs';
//import latinize from "./node_modules/latinize/latinize.js";
import latinize from "latinize";
import { ProgressBar } from '@opentf/cli-pbar';
import {Command} from "commander";
const progName = 'hedgedoc-backup';
const cli = new Command();
cli.name(progName)
    .description(`CLI tools to backup demo.hedgedoc.org`)
    .version('1.0.0')
    .argument('<fileName>', 'Will convert every link (one by line) in <fileName> then download them in a folder named like <fileName>')
    .action(async (fileName) => {
        await main(fileName);
    });
cli.parse();


function normalize(url:string):string {
    return url.replace('demo.hedgedoc','demo-archive.hedgedoc')
        .split('#')[0].split('?')[0]
        .split('/edit')[0].split('/publish')[0].split('/slide')[0]
}
async function main(inputFileName:string){
    const urls:Set<string> = new Set();
    const later:Set<string> = new Set();
    const dlBar = new ProgressBar({
        //color: 'pi',
        //bgColor: 'r',
        variant: 'PLAIN',
        showPercent: false,
        showCount: true,
        prefix: 'Downloading pads        ',
    });
    const saveBar = new ProgressBar({
        //color: 'pi',
        //bgColor: 'r',
        variant: 'PLAIN',
        showPercent: false,
        showCount: true,
        prefix: 'Saving deduplicated pads',
    });
    readFileSync(`${inputFileName}`,'utf8').split("\n").forEach(line => {
        const normalized = `${normalize(line)}`;
        if(normalized.match(/\/[sp]\//) === null) urls.add(normalized);
        else later.add(normalized);
    });
    later.forEach(v=>urls.add(v));

    type Meta = {"title":string,"description":string|null,"viewcount":number,"createtime":string,"updatetime":string};
    const dlSuffix = '/download';
    const metaSuffix = '/info';
    const contents:Map<string,{urls:string[],meta:Meta,content:string}> = new Map();
    dlBar.start({ total: urls.size });
    for(let link of urls){
        if(!link) continue;
        try{
            dlBar.inc({ suffix: link.split('/').pop() });
            if(link.match(/\/[sp]\//) !== null){
                const res = await fetch(link + '/edit');
                link = normalize(res.url);
            }
            let content = await (await fetch(link + dlSuffix)).text();
            const len = content.length;
            if(!len) {
                const rev = await (await fetch(link + '/revision')).json();
                const version = rev.revision.filter(r=>r.length)[0].time;
                content = await (await fetch(`${link}/revision/${version}`)).text();
            }
            //if(len!==content.length) console.log('0 -> ',content.length);
            //else console.log(content.length);
            if(contents.has(content)) {
                const upd = contents.get(content);
                upd.urls.push(link);
                contents.set(content,upd);
            } else {
                const meta = await (await fetch(link + metaSuffix)).json();
                contents.set(content,{
                    urls:[link],
                    content,
                    meta
                });
            }
        } catch (e){
            console.error(link, e);
        }
    }
    dlBar.stop();
    let outputFolder = inputFileName.split('.')[0];
    if(inputFileName === outputFolder) {
        //console.error(inputFileName, 'must have an extension.',outputFolder, 'will be a folder.')
        outputFolder+='-backup';
    }
    try{
        const info = statSync(outputFolder);
        if(!info.isDirectory()) mkdirSync(outputFolder);
    }catch (e){
        mkdirSync(outputFolder)
    }
    saveBar.start({ total: contents.size });
    contents.forEach(file=>{
        const fileName = `${outputFolder
        }/${file.meta.createtime.split('T')[0]
        //}.${file.urls.length
        }.${latinize(file.meta.title).replace(/[^A-Z0-9]+/gi,'-')
        }.${file.urls[0].split('/').pop()
        }.md`;
        saveBar.inc({ suffix: fileName });
        const fileContent = `------\n${JSON.stringify(file.meta)}\n${JSON.stringify(file.urls)}\n------\n${file.content}`
        writeFileSync(fileName,fileContent,'utf8');
    });
    saveBar.stop();

}
