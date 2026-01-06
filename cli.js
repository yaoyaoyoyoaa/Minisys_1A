const fs = require('fs');
const { assemblerCore } = require('./core'); 
const { linker } = require('./linker');      
const miniC = require('./mini_c');           

function buildSystem() {
    console.log("[IDE] Starting Build...");

    // 1. 编译 C 代码 (user.c)
    console.log("[IDE] Compiling user.c...");
    const cSource = fs.readFileSync('./user.c', 'utf8');
    const userAsm = miniC.compile(cSource);

    // 2. 读取汇编代码
    const biosAsm = fs.readFileSync('./bios.s', 'utf8');
    let isrAsm = ".text\n nop\n eret\n"; // 默认存根
    if (fs.existsSync('./isr.s')) {
        isrAsm = fs.readFileSync('./isr.s', 'utf8');
        console.log("[IDE] Loaded isr.s");
    }

    // 3. 汇编 (Assembly)
    console.log("[IDE] Assembling segments...");
    const biosObj = assemblerCore(biosAsm);
    const userObj = assemblerCore(userAsm);
    const isrObj  = assemblerCore(isrAsm);

    // 4. 链接 (Linking)
    console.log("[IDE] Linking (BIOS=0x0, USER=0x400)...");
    const fullImage = linker(biosObj, userObj, isrObj);

    // 5. 生成 COE 文件
    if (!fs.existsSync('./dist')) fs.mkdirSync('./dist');
    const coe = "memory_initialization_radix=16;\nmemory_initialization_vector=\n" + 
                fullImage.map(w => (w>>>0).toString(16).padStart(8,'0')).join(',\n') + ";";
    
    fs.writeFileSync('./dist/program.coe', coe);
    console.log("[IDE] SUCCESS: dist/program.coe generated.");
}

if (process.argv.includes('--build')) buildSystem();