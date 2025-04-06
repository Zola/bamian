// 设置 localStorage 过期时间
const FORM_EXPIRY_TIME = 3 * 60 * 1000; // 3分钟，单位：毫秒
const TARGET_EXPIRY_TIME = 60 * 24 * 60 * 60 * 1000; // 60天，单位：毫秒

// 记录开始时间
let startTime = null;

// 设置新的过期时间
function setExpiryTime(type) {
    if (type === 'form') {
        localStorage.setItem('formExpiryTime', Date.now() + FORM_EXPIRY_TIME);
    } else if (type === 'target') {
        localStorage.setItem('targetExpiryTime', Date.now() + TARGET_EXPIRY_TIME);
    }
}

// 清理过期的 localStorage 数据
function clearExpiredStorage() {
    const formExpiryTime = localStorage.getItem('formExpiryTime');
    const targetExpiryTime = localStorage.getItem('targetExpiryTime');
    
    // 检查个人资料是否过期
    if (formExpiryTime && Date.now() > parseInt(formExpiryTime)) {
        localStorage.removeItem('formData');
        localStorage.removeItem('formExpiryTime');
    }
    
    // 检查目标信息是否过期
    if (targetExpiryTime && Date.now() > parseInt(targetExpiryTime)) {
        localStorage.removeItem('currentTarget');
        localStorage.removeItem('targetExpiryTime');
    }
}

// 初始化 Select2
$(document).ready(function() {
    // 定期检查并清理过期数据
    setInterval(clearExpiredStorage, 60000); // 每分钟检查一次
    
    // 图片缓存
    const imageCache = new Map();
    
    // 加载本地数据
    $.getJSON('data.json', function(jsonData) {
        data = jsonData.targets; // 保存数据到全局变量
        $('#targetSearch').select2({
            placeholder: '請選擇或輸入姓名',
            allowClear: true,
            minimumInputLength: 1,
            language: {
                inputTooShort: function() {
                    return '請輸入至少一個漢字，再使用Tab鍵完成確認';
                },
                searching: function() {
                    return '搜尋中...';
                },
                noResults: function() {
                    return '找不到符合的結果';
                }
            },
            data: data.map(target => ({
                id: target.name,
                text: `${target.name} (${target.district})`
            }))
        });
    });

    // 监听选择变化
    $('#targetSearch').on('select2:select', function(e) {
        const selectedName = e.params.data.id;
        // 记录开始时间
        startTime = Date.now();
        // 清理之前的 PDF 相关数据
        localStorage.removeItem('pdfData');
        localStorage.removeItem('formData');
        localStorage.removeItem('formExpiryTime');
        // 设置新的目标过期时间
        setExpiryTime('target');
        loadTargetInfo(selectedName);
    });

    // 更新標籤雲
    function updateTagCloud() {
        tagCloudContainer.innerHTML = '';
        data.forEach(item => {
            const name = item.name;
            const count = petitionStats[name] || 0;
            const size = Math.max(1, Math.min(2, 1 + count * 0.1)); // 根據聯署次數調整大小
            const tag = document.createElement('a');
            tag.className = 'tag-cloud-item';
            tag.textContent = `${name} (${count})`;
            tag.style.fontSize = `${size}em`;
            tag.onclick = function(e) {
                e.preventDefault();
                loadTargetInfo(name);
            };
            tagCloudContainer.appendChild(tag);
        });
    }
});

// 加载目标信息
function loadTargetInfo(name) {
    // 從 data.json 中獲取目標信息
    const target = data.find(t => t.name === name);
    if (!target) {
        console.error('找不到目標信息');
        return;
    }

    // 計算截止日期和剩餘天數
    const deadline = new Date(target.deadline);
    const now = new Date();
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // 顯示目標信息
    const targetInfo = document.getElementById('targetInfo');
    targetInfo.innerHTML = `
        <p style="font-size: 16px; margin: 0; padding: 10px;">
            罷免對象：<span style="font-size: 24px; color: #ff0000; font-weight: bold;">${target.name}</span> | 
            選區：${target.district} | 
            截止日期：${target.deadline}（還有 ${diffDays} 天）
        </p>
    `;
    targetInfo.style.display = 'block';

    // 隱藏主標題和搜索區域
    document.getElementById('mainTitle').style.display = 'none';
    document.getElementById('searchSection').style.display = 'none';

    // 顯示表單
    document.getElementById('petitionForm').style.display = 'block';

    // 保存當前目標到 localStorage
    localStorage.setItem('currentTarget', JSON.stringify(target));
    setExpiryTime('target');
}

// 表单提交处理
$('#petitionForm').on('submit', function(e) {
    e.preventDefault();
    
    // 检查是否有选择目标
    const target = JSON.parse(localStorage.getItem('currentTarget'));
    if (!target) {
        alert('請先選擇罷免對象');
        return;
    }
    
    const formData = {
        name: $('#name').val(),
        idNumber: $('#idNumber').val(),
        birthDate: $('#birthDate').val(),
        address: $('#address').val()
    };
    
    // 存储表单数据到 localStorage
    localStorage.setItem('formData', JSON.stringify(formData));
    // 设置表单数据过期时间
    setExpiryTime('form');
    
    // 隐藏表单
    $('#petitionForm').hide();
    
    generatePDF();
});

// 加载图片
async function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';  // 允许跨域加载图片
        
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
        
        img.src = src;
    });
}

// 在 Canvas 上绘制图片和文字
async function drawOnCanvas(img, formData, fields) {
    // 创建 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    
    // 绘制图片
    ctx.drawImage(img, 0, 0);
    
    // 设置文字样式
    ctx.fillStyle = 'black';
    ctx.textBaseline = 'middle';
    
    // 添加姓名 - 均匀排列
    if (fields.name && formData.name) {
        ctx.font = `${fields.name.fontSize}px Arial`;
        
        const name = formData.name;
        const maxWidth = fields.name.maxWidth;
        const charCount = name.length;
        
        // 计算每个字符的宽度（假设每个字符宽度相同）
        const charWidth = ctx.measureText('测').width; // 使用中文字符测量宽度
        
        // 计算字符之间的间距，使字符均匀分布在maxWidth内
        const totalCharWidth = charWidth * charCount;
        const spacing = (maxWidth - totalCharWidth) / (charCount - 1);
        
        // 计算起始x坐标
        const startX = fields.name.x;
        
        // 绘制每个字符
        for (let i = 0; i < charCount; i++) {
            const x = startX + (charWidth + spacing) * i;
            ctx.fillText(name.charAt(i), x, fields.name.y);
        }
    }
    
    // 添加身份证号 - 均匀排列
    if (fields.idNumber && formData.idNumber) {
        ctx.font = `${fields.idNumber.fontSize}px Arial`;
        
        const idNumber = formData.idNumber;
        const maxWidth = fields.idNumber.maxWidth;
        const charCount = idNumber.length;
        
        // 计算每个字符的宽度（假设每个数字宽度相同）
        const charWidth = ctx.measureText('0').width;
        
        // 计算字符之间的间距，使字符均匀分布在maxWidth内
        const totalCharWidth = charWidth * charCount;
        const spacing = (maxWidth - totalCharWidth) / (charCount - 1);
        
        // 计算起始x坐标
        const startX = fields.idNumber.x;
        
        // 绘制每个字符
        for (let i = 0; i < charCount; i++) {
            const x = startX + (charWidth + spacing) * i;
            ctx.fillText(idNumber.charAt(i), x, fields.idNumber.y);
        }
    }
    
    // 添加出生日期
    ctx.font = `${fields.birthDate.fontSize}px Arial`;
    ctx.fillText(formData.birthDate, fields.birthDate.x, fields.birthDate.y);
    
    // 添加地址 - 支持換行
    ctx.font = `${fields.address.fontSize}px Arial`;
    const address = formData.address;
    const maxWidth = fields.address.maxWidth;
    const lineHeight = fields.address.fontSize * 1.2; // 行高為字體大小的1.2倍
    
    // 如果地址長度超過最大寬度，則需要換行
    if (ctx.measureText(address).width > maxWidth) {
        let currentLine = '';
        let lines = [];
        const words = address.split('');
        
        for (let i = 0; i < words.length; i++) {
            const testLine = currentLine + words[i];
            const testWidth = ctx.measureText(testLine).width;
            
            if (testWidth > maxWidth && i > 0) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
        
        // 繪製每一行
        lines.forEach((line, index) => {
            const y = fields.address.y + (index * lineHeight);
            ctx.fillText(line, fields.address.x, y);
        });
    } else {
        // 如果地址不超過最大寬度，則直接繪製
        ctx.fillText(address, fields.address.x, fields.address.y);
    }
    
    return canvas;
}

// 生成 PDF
async function generatePDF() {
    try {
        // 检查是否有选择目标
        let target = JSON.parse(localStorage.getItem('currentTarget'));
        const targetExpiryTime = localStorage.getItem('targetExpiryTime');
        
        // 如果目标信息不存在或已过期，尝试从当前页面获取
        if (!target || (targetExpiryTime && Date.now() > parseInt(targetExpiryTime))) {
            const targetInfo = $('#targetInfo .alert-info h4').text();
            if (targetInfo) {
                const targetName = targetInfo.replace('罷免對象：', '').trim();
                target = data.find(item => item.name === targetName);
                if (target) {
                    // 重新保存目标信息
                    localStorage.setItem('currentTarget', JSON.stringify(target));
                    localStorage.setItem('targetExpiryTime', Date.now() + (60 * 24 * 60 * 60 * 1000));
                } else {
                    throw new Error('請先選擇罷免對象');
                }
            } else {
                throw new Error('請先選擇罷免對象');
            }
        }
        
        const formData = JSON.parse(localStorage.getItem('formData'));
        if (!formData) {
            return; // 如果沒有表單數據，直接返回，不顯示錯誤
        }
        
        // 检查表单数据是否过期
        const formExpiryTime = localStorage.getItem('formExpiryTime');
        if (formExpiryTime && Date.now() > parseInt(formExpiryTime)) {
            throw new Error('表單資料已過期，請重新填寫');
        }
        
        // 加载模板配置
        let templateConfig;
        try {
            const timestamp = new Date().getTime();
            const response = await fetch(`config/template-config.json?t=${timestamp}`);
            if (!response.ok) {
                throw new Error(`无法加载模板配置: ${response.status} ${response.statusText}`);
            }
            templateConfig = await response.json();
            console.log('成功加载模板配置:', Object.keys(templateConfig));
        } catch (error) {
            console.error('加载模板配置失败:', error);
            alert('加载模板配置失败，請刷新頁面重試。');
            return;
        }
        
        // 获取当前目标的模板配置
        const targetConfig = templateConfig[target.name];
        
        if (!targetConfig) {
            console.error(`找不到${target.name}的模板配置，可用的配置有:`, Object.keys(templateConfig));
            alert(`找不到${target.name}的模板配置，請聯繫管理員。`);
            return;
        }
        
        console.log(`成功找到${target.name}的模板配置:`, targetConfig);
        
        // 加载模板图片
        const templateImage = await loadImage(targetConfig.template);
        
        // 在 Canvas 上绘制图片和文字
        const canvas = await drawOnCanvas(templateImage, formData, targetConfig.fields);
        
        // 创建新的 jsPDF 实例
        if (typeof window.jspdf === 'undefined') {
            throw new Error('jsPDF 未正确加载');
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'landscape',  // 使用横向
            unit: 'mm',
            format: 'a4'
        });
        
        // 获取 Canvas 的图像数据
        const canvasDataUrl = canvas.toDataURL('image/png');
        
        // 计算图片在PDF中的尺寸，保持原始比例
        const pageWidth = 297;  // A4 横向宽度（毫米）
        const pageHeight = 210; // A4 横向高度（毫米）
        
        // 计算缩放比例
        const scale = Math.min(
            pageWidth / canvas.width,
            pageHeight / canvas.height
        );
        
        // 计算居中位置
        const scaledWidth = canvas.width * scale;
        const scaledHeight = canvas.height * scale;
        const x = (pageWidth - scaledWidth) / 2;
        const y = (pageHeight - scaledHeight) / 2;
        
        // 添加 Canvas 图像到 PDF
        doc.addImage(canvasDataUrl, 'PNG', x, y, scaledWidth, scaledHeight);
        
        // 生成 PDF blob
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        
        // 显示 PDF 预览
        const pdfContainer = document.createElement('div');
        pdfContainer.style.marginTop = '20px';
        
        // 创建按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'd-flex justify-content-between align-items-center mb-3';
        
        // 创建返回按钮
        const backButton = document.createElement('button');
        backButton.className = 'btn btn-secondary';
        backButton.textContent = '返回修改資料';
        backButton.onclick = function() {
            // 隐藏返回按钮和预览区域
            $(this).hide();
            $('.preview-container').hide();
            // 显示表单
            $('#petitionForm').show();
        };
        
        // 创建下载按钮
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn btn-primary';
        downloadBtn.textContent = '下載PDF再去便利店列印';
        downloadBtn.onclick = function() {
            const link = document.createElement('a');
            link.href = pdfUrl;
            link.download = `聯署書_${formData.name}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 显示覆盖层
            showOverlay();
        };
        
        // 创建打印按钮
        const printBtn = document.createElement('button');
        printBtn.className = 'btn btn-success';
        printBtn.textContent = '列印';
        printBtn.onclick = function() {
            const printWindow = window.open(pdfUrl, '_blank');
            printWindow.onload = function() {
                // 添加打印样式
                const style = printWindow.document.createElement('style');
                style.textContent = `
                    @page {
                        size: landscape;
                        margin: 0;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    iframe {
                        width: 100%;
                        height: 100vh;
                        border: none;
                        transform: scale(1);
                        transform-origin: 0 0;
                    }
                `;
                printWindow.document.head.appendChild(style);
                
                // 延迟执行打印，确保样式已应用
                setTimeout(function() {
                    printWindow.print();
                }, 1000);
            };
            
            // 显示覆盖层
            showOverlay();
        };
        
        // 添加按钮到容器
        buttonContainer.appendChild(backButton);
        buttonContainer.appendChild(downloadBtn);
        buttonContainer.appendChild(printBtn);
        
        // 添加按钮容器到预览区域的最前面
        $('#pdfPreview').empty().append(buttonContainer);
        
        const pdfIframe = document.createElement('iframe');
        pdfIframe.src = pdfUrl;
        pdfIframe.width = '100%';
        pdfIframe.height = '560px';
        pdfIframe.style.border = 'none';
        pdfIframe.style.overflow = 'hidden';
        pdfIframe.style.margin = 'auto'; // 添加這行以居中顯示
        $('#pdfPreview').append(pdfIframe);
        
        $('.preview-container').show();
        
        // 存储 PDF URL 到按钮的 data 属性
        $(printBtn).data('pdfUrl', pdfUrl);
        $(downloadBtn).data('pdfUrl', pdfUrl);
    } catch (error) {
        console.error('PDF生成失败:', error);
        alert('PDF生成失败：' + error.message);
    }
}

// 显示覆盖层
function showOverlay() {
    try {
        const formData = JSON.parse(localStorage.getItem('formData'));
        const target = JSON.parse(localStorage.getItem('currentTarget'));
        const firstName = formData.name.charAt(0);
        
        // 计算联署用时
        const endTime = Date.now();
        // 确保startTime不为null，如果为null则使用当前时间
        if (!startTime) {
            startTime = endTime;
        }
        const timeSpent = Math.round((endTime - startTime) / 1000); // 转换为秒
        
        const message = `${firstName} ** 先生/小姐，罷免不適任的${target.name}可以讓立法院回歸正軌。\n\n感謝你行使自己的政治權利。\n\n你聯署只花了${timeSpent}秒，你擊敗了100%的中國人！`;
        $('.overlay-message').text(message);
        
        // 更新继续按钮的文本
        $('#continueBtn').text(`繼續填寫罷免${target.name}`);
        
        $('#overlay').show();
        // 确保继续按钮获得焦点
        setTimeout(() => {
            $('#continueBtn').focus();
        }, 100);
    } catch (error) {
        console.error('显示覆盖层失败:', error);
    }
}

// 处理覆盖层按钮点击事件
$(document).ready(function() {
    // 继续罢免当前对象
    $('#continueBtn').on('click', function() {
        // 隐藏覆盖层
        $('#overlay').hide();
        
        // 清空表单数据
        $('#name').val('');
        $('#idNumber').val('');
        $('#birthDate').val('');
        $('#address').val('');
        
        // 重置计时器
        startTime = Date.now();
        
        // 显示表单
        $('#petitionForm').show();
        
        // 隐藏预览区域
        $('.preview-container').hide();
    });
    
    // 选择其他区域对象
    $('#changeBtn').on('click', function() {
        // 隐藏覆盖层
        $('#overlay').hide();
        
        // 清空所有数据
        localStorage.removeItem('currentTarget');
        localStorage.removeItem('formData');
        
        // 重置计时器
        startTime = null;
        
        // 显示主标题和搜索区域
        $('#mainTitle').show();
        $('#searchSection').show();
        
        // 隐藏目标信息和表单
        $('#targetInfo').hide();
        $('#petitionForm').hide();
        
        // 隐藏预览区域
        $('.preview-container').hide();
        
        // 重置 Select2
        $('#targetSearch').val(null).trigger('change');
    });
});

// 顯示聯署表單
function showPetitionForm(name) {
    // 隱藏搜索區域和標籤雲
    searchSection.style.display = 'none';
    
    // 隱藏主標題
    document.getElementById('mainTitle').style.display = 'none';
    
    // 顯示表單
    const petitionForm = document.getElementById('petitionForm');
    petitionForm.style.display = 'block';
    
    // 更新聯署統計
    updatePetitionStats(name);
    
    // 顯示目標信息
    const targetInfo = document.getElementById('targetInfo');
    const target = data.find(item => item.name === name);
    if (target) {
        // 計算剩餘天數
        const deadline = new Date(target.deadline).getTime();
        const today = new Date().getTime();
        const diffTime = deadline - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        targetInfo.innerHTML = `
            <div class="alert alert-info">
                <h4 class="mb-2">罷免對象：${target.name}</h4>
                <p class="mb-1">選區：${target.district}</p>
                <p class="mb-0">截止日期：${target.deadline}（還有 ${diffDays} 天）</p>
            </div>
        `;
        targetInfo.style.display = 'block';
    }
}

// 處理"我要罷免其他區域的立法委員"按鈕點擊事件
changeBtn.addEventListener('click', function() {
    // 顯示搜索區域和標籤雲
    searchSection.style.display = 'block';
    // 隱藏結果區域和表單
    resultSection.style.display = 'none';
    document.getElementById('petitionForm').style.display = 'none';
    // 隱藏覆蓋層
    document.getElementById('overlay').style.display = 'none';
    // 顯示主標題
    document.getElementById('mainTitle').style.display = 'block';
    // 隱藏目標信息
    document.getElementById('targetInfo').style.display = 'none';
    // 重置 Select2
    $(targetSearch).val('').trigger('change');
}); 