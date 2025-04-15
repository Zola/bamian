const CACHE_NAME = 'bamian-cache-v1';

// 预缓存资源列表
const IMAGES_TO_CACHE = [
  '/images/顏寬恒.png',
  '/images/游顥.png',
  '/images/preview.png',
  '/images/丁學忠.png',
  '/images/傅崐萁.png',
  '/images/呂玉玲.png',
  '/images/廖偉翔.png',
  '/images/廖先翔.png',
  '/images/張智倫.png',
  '/images/徐巧芯.png',
  '/images/徐欣瑩.png',
  '/images/李彥秀.png',
  '/images/林德福.png',
  '/images/林思銘.png',
  '/images/林沛祥.png',
  '/images/楊瓊瓔.png',
  '/images/江啟臣.png',
  '/images/洪孟楷.png',
  '/images/涂權吉.png',
  '/images/牛煦庭.png',
  '/images/王鴻薇.png',
  '/images/羅廷瑋.png',
  '/images/羅明才.png',
  '/images/羅智強.png',
  '/images/萬美玲.png',
  '/images/葉元之.png',
  '/images/謝衣鳯.png',
  '/images/賴士葆.png',
  '/images/邱若華.png',
  '/images/邱鎮軍.png',
  '/images/鄭正鈐.png',
  '/images/陳超明.png',
  '/images/馬文君.png',
  '/images/高虹安.png',
  '/images/魯明哲.png',
  '/images/黃健豪.png',
  '/images/黃建賓.png'
];

const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/main.js',
  '/data.json',
  '/config/template-config.json',
  '/assets/css/bootstrap.min.css',
  '/assets/css/select2.min.css',
  '/assets/js/jquery.min.js',
  '/assets/js/bootstrap.bundle.min.js',
  '/assets/js/select2.min.js',
  '/assets/js/jspdf.umd.min.js'
];

// 安装Service Worker时缓存所有资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('开始缓存资源...');
        // 先缓存静态资源
        return cache.addAll(STATIC_RESOURCES)
          .then(() => {
            console.log('静态资源缓存完成');
            // 然后缓存图片
            return cache.addAll(IMAGES_TO_CACHE);
          })
          .then(() => {
            console.log('所有资源缓存完成');
          });
      })
  );
});

// 激活 Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 处理fetch请求
self.addEventListener('fetch', (event) => {
  // 忽略URL参数，只匹配基本URL
  const url = new URL(event.request.url);
  const requestWithoutParams = new Request(url.origin + url.pathname, {
    method: event.request.method,
    headers: event.request.headers,
    mode: event.request.mode,
    credentials: event.request.credentials,
    redirect: event.request.redirect,
    referrer: event.request.referrer,
    integrity: event.request.integrity
  });

  event.respondWith(
    caches.match(requestWithoutParams)
      .then((response) => {
        // 如果在缓存中找到响应，则返回缓存的响应
        if (response) {
          return response;
        }

        // 如果没有在缓存中找到，则从网络获取
        return fetch(event.request)
          .then((response) => {
            // 检查是否是有效的响应
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // 克隆响应，因为响应流只能使用一次
            const responseToCache = response.clone();

            // 将新响应添加到缓存
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(requestWithoutParams, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // 如果网络请求失败，对于图片请求返回一个默认图片
            if (event.request.url.match(/\.(png|jpg|jpeg|gif)$/)) {
              return caches.match('/images/preview.png');
            }
          });
      })
  );
}); 