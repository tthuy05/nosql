const fs = require('fs');
const path = require('path');
const https = require('https');

const dir = path.join(__dirname, '../src/public/images/products');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const images = [
  { file: 'sp01.jpg', url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80' },
  { file: 'sp02.jpg', url: 'https://images.unsplash.com/photo-1542272604-780c96856592?w=600&auto=format&fit=crop&q=80' },
  { file: 'sp03.jpg', url: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=600&auto=format&fit=crop&q=80' },
  { file: 'sp04.jpg', url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&auto=format&fit=crop&q=80' },
  { file: 'sp05.jpg', url: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=600&auto=format&fit=crop&q=80' },
  { file: 'sp06.jpg', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80' },
  { file: 'sp07.jpg', url: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=600&auto=format&fit=crop&q=80' },
  { file: 'sp08.jpg', url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80' },
  { file: 'sp09.jpg', url: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&auto=format&fit=crop&q=80' },
  { file: 'sp10.jpg', url: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600&auto=format&fit=crop&q=80' }
];

function download(item) {
  return new Promise((resolve, reject) => {
    const dest = path.join(dir, item.file);
    const file = fs.createWriteStream(dest);

    function get(url) {
      https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return get(response.headers.location);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Status ${response.statusCode} for ${item.file}`));
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✅ Downloaded: ${item.file} (${fs.statSync(dest).size} bytes)`);
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }

    get(item.url);
  });
}

async function run() {
  for (const item of images) {
    try {
      await download(item);
    } catch (e) {
      console.error(`❌ Error downloading ${item.file}:`, e.message);
    }
  }
  console.log('🎉 Hoan tat tai 10 anh san pham that!');
}

run();
