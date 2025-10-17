/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

export const WITTY_LOADING_PHRASES = [
  "手气不错",
  "正在运送精彩内容...",
  "重新绘制衬线字体...",
  "正在穿越黏菌网络...",
  "正在咨询数字精灵...",
  "正在网格化样条...",
  "正在预热AI仓鼠...",
  "正在询问魔法海螺...",
  "正在生成机智回应...",
  "正在抛光算法...",
  "不要催促完美（或我的代码）...",
  "正在冲泡新鲜字节...",
  "正在计数电子...",
  "正在启动认知处理器...",
  "正在检查宇宙中的语法错误...",
  "稍等，正在优化幽默感...",
  "正在洗牌笑点...",
  "正在解开神经网络...",
  "正在编译卓越...",
  "正在加载wit.exe...",
  "正在召唤智慧云...",
  "正在准备机智回应...",
  "稍等，我正在调试现实...",
  "正在混淆选项...",
  "正在调整宇宙频率...",
  "正在制作值得您耐心等待的回应...",
  "正在编译1和0...",
  "正在解决依赖关系...以及存在危机...",
  "正在碎片整理记忆...包括RAM和个人记忆...",
  "正在重启幽默模块...",
  "正在缓存必需品（主要是猫咪表情包）...",
  "正在优化到超高速",
  "正在交换位...别告诉字节们...",
  "正在垃圾回收...马上回来...",
  "正在组装互联网...",
  "正在将咖啡转换为代码...",
  "正在更新现实的语法...",
  "正在重新连接突触...",
  "正在寻找丢失的分号...",
  "正在润滑机器的齿轮...",
  "正在预热服务器...",
  "正在校准通量电容器...",
  "正在启动不可能性驱动器...",
  "正在引导原力...",
  "正在对齐星象以获得最佳响应...",
  "我们都是这样...",
  "正在加载下一个伟大想法...",
  "稍等，我正在专注中...",
  "正在准备用卓越震撼您...",
  "稍等，我正在打磨我的机智...",
  "稍等，我正在创作杰作...",
  "稍等，我正在调试宇宙...",
  "稍等，我正在对齐像素...",
  "稍等，我正在优化幽默...",
  "稍等，我正在调整算法...",
  "已启动曲速引擎...",
  "正在挖掘更多双锂晶体...",
  "不要惊慌...",
  "正在跟随白兔...",
  "真相就在某处...",
  "正在吹卡带...",
  "正在加载...来做个桶滚！",
  "正在等待重生...",
  "正在以少于12秒差距的时间完成凯塞尔航线...",
  "蛋糕不是谎言，只是还在加载...",
  "正在摆弄角色创建界面...",
  "稍等，我正在找合适的表情包...",
  "按'A'继续...",
  "正在驱赶数字猫群...",
  "正在抛光像素...",
  "正在寻找合适的加载屏幕双关语...",
  "正在用这个机智的短语分散您的注意力...",
  "快完成了...大概吧...",
  "我们的仓鼠正在全速运转...",
  "正在轻抚Cloudy的头...",
  "正在撸猫...",
  "正在给老板播放《理查德·德莱弗斯》...",
  "永远不会放弃你，永远不会让你失望...",
  "正在弹低音...",
  "正在品尝斯诺兹浆果...",
  "我要走得更远，我要追求速度...",
  "这是真实生活吗？还是只是幻想？...",
  "我对这件事有很好的感觉...",
  "正在戳熊...",
  "正在研究最新表情包...",
  "正在想办法让它更机智...",
  "嗯...让我想想...",
  "没有眼睛的鱼叫什么？叫Fsh...",
  "为什么电脑要去心理治疗？因为它有太多字节...",
  "为什么程序员不喜欢大自然？因为它有太多bug...",
  "为什么程序员喜欢暗色模式？因为光会吸引bug...",
  "为什么开发者破产了？因为他们用光了所有缓存...",
  "断铅笔能做什么？没什么，它毫无意义...",
  "正在应用敲击维护...",
  "正在寻找正确的USB方向...",
  "正在确保魔法烟雾留在电线里...",
  "正在毫无理由地用Rust重写...",
  "正在尝试退出Vim...",
  "正在启动仓鼠轮...",
  "那不是bug，是未记录的功能...",
  "启动。",
  "我会回来的...带着答案。",
  "我的另一个进程是TARDIS...",
  "正在与机器灵魂交流...",
  "正在让想法发酵...",
  "刚想起我把钥匙放哪儿了...",
  "正在凝视水晶球...",
  "我见过你们这些人不会相信的事情...比如有用户会读加载消息。",
  "正在发起深思凝视...",
  "电脑最喜欢的小吃是什么？微芯片。",
  "为什么Java开发者戴眼镜？因为他们不C#。",
  "正在为激光充能...砰砰！",
  "正在除以零...开玩笑的！",
  "正在寻找成年监督者...我是说，正在处理。",
  "正在让它发出哔哔声。",
  "正在缓冲...因为即使是AI也需要时间。",
  "正在纠缠量子粒子以获得更快的响应...",
  "正在抛光铬...在算法上。",
  "你没被娱乐到吗？（正在努力！）",
  "正在召唤代码小精灵...当然是来帮忙的。",
  "正在等待拨号音结束...",
  "正在重新校准幽默计。",
  "我的另一个加载屏幕更有趣。",
  "确定键盘上有猫在走动...",
  "正在增强...正在增强...仍在加载。",
  "这不是bug，这是加载屏幕的一个功能。",
  "您试过关机再开机吗？（说的是加载屏幕，不是我。）",
  "正在建造额外的水晶塔...",
  "换行？那是Ctrl+J。",
];

export const PHRASE_CHANGE_INTERVAL_MS = 15000;

/**
 * Custom hook to manage cycling through loading phrases.
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (isActive: boolean, isWaiting: boolean) => {
  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState(
    WITTY_LOADING_PHRASES[0],
  );
  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isWaiting) {
      setCurrentLoadingPhrase('正在等待用户确认...');
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    } else if (isActive) {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
      }
      // Select an initial random phrase
      const initialRandomIndex = Math.floor(
        Math.random() * WITTY_LOADING_PHRASES.length,
      );
      setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[initialRandomIndex]);

      phraseIntervalRef.current = setInterval(() => {
        // Select a new random phrase
        const randomIndex = Math.floor(
          Math.random() * WITTY_LOADING_PHRASES.length,
        );
        setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[randomIndex]);
      }, PHRASE_CHANGE_INTERVAL_MS);
    } else {
      // Idle or other states, clear the phrase interval
      // and reset to the first phrase for next active state.
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
      setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[0]);
    }

    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [isActive, isWaiting]);

  return currentLoadingPhrase;
};
