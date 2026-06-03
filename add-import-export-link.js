const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'admin', 'produtos.html');
let content = fs.readFileSync(filePath, 'utf8');

const search = '<button onclick="openModal()" class="flex items-center gap-2 bg-textPrimary text-white px-4 py-1.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">\n          <i data-lucide="plus" class="w-4 h-4"></i> Novo\n        </button>';

const replace = '<button onclick="openModal()" class="flex items-center gap-2 bg-textPrimary text-white px-4 py-1.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">\n          <i data-lucide="plus" class="w-4 h-4"></i> Novo\n        </button>\n        <a href="import-export.html" class="flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors">\n          <i data-lucide="exchange-cw" class="w-4 h-4"></i> Importar/Exportar\n        </a>';

if (content.includes(search)) {
  content = content.replace(search, replace);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Link adicionado com sucesso');
} else {
  console.log('⚠️  Não foi possível encontrar a secção');
}
