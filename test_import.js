import fs from 'fs';
import ExcelJS from 'exceljs';

async function run() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Produtos');
  worksheet.columns = [
    { header: 'ID', key: 'id' },
    { header: 'Nome', key: 'name' },
    { header: 'Preço', key: 'price' }
  ];
  worksheet.addRow({ id: '', name: 'Test Product', price: '10,50' });
  const fileBuffer = await workbook.xlsx.writeBuffer();
  fs.writeFileSync('test.xlsx', fileBuffer);
  console.log('Created test.xlsx');

  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  let body = '';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="test.xlsx"\r\n`;
  body += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
  
  const footer = `\r\n--${boundary}--\r\n`;
  
  const payload = Buffer.concat([
    Buffer.from(body, 'utf8'),
    Buffer.from(fileBuffer),
    Buffer.from(footer, 'utf8')
  ]);

  try {
    const res = await fetch('http://localhost:3000/api/import-products', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': 'Bearer dummy_token_for_test'
      },
      body: payload
    });
    console.log('Response Status:', res.status);
    console.log('Response Body:', await res.text());
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
