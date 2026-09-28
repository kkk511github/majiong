# 按19:59两张参考图调整操作区

仅调整实际React操作区的主次比例和相对位置，保留原创晶体底材、胡火焰环、碰杠蓝色效果，不改牌桌/牌尺寸，也不替换参考图中的商业素材。

## 参考尺度及落地

1280宽参考图：主操作圆约90px、过约70px，中心大约914/1058，相距约144px，纵向中心约422。
实现默认88/68px，与手牌上缘相隔6px；两按钮共用水平中心线。单自摸只用主操作位置，不移到过的位置。多主操作向左展开，“过”在末端小一档且隔开。
小屏仍保留至少44px热区。若参考位置与实际牌发生碰撞，按最小代价在轻微缩小、压缩间距和整组左移之间选择；不移动手牌/弃牌/花牌，不让触摸中的按钮重新排布。
碰撞使用各按钮矩形而非含透明间隙的整行矩形，允许公开牌位于按钮间真正的留白里。
左侧来牌/胡牌提示保留上轮已验证的独立安全区域。

## 展示与验证

现有DEV入口新增合法胡+过场景，全部选项由shared/engine真实判断，不伪造业务动作：单胡自摸、胡+过、碰+过、单暗杠、全动作。
`/?actionStudio=1&crowded=1&tableOnly=1&choice=hu-claim`。
截图：output/qa/action-reference-controls/*-{hu,hu-claim,pung,kong,all}.png。
tests/table-action-rail.test.ts覆盖参考88/68尺寸及914/1058中心、单按钮不右移、8张本家花牌+密集弃牌时的四按钮避让（1280×590、844×390）。
真实Cocos/Chromium/WebKit截图与边界检查见.tmp/reference-controls-browser.log和.tmp/reference-controls-final.log；正式网页构建见.tmp/reference-controls-build.log。

本次未部署、未修改服务器或计分、未重新打包；已交付的0.8.6/Build83文件保持原状。

## 同日追加：过靠近主按钮

用户反馈碰/胡与过太远。只将主操作→过的边缘间距改为设计宽1280时22px，窄屏按比例缩放但不少于12px；其他主操作之间的间距、主按钮大小及首选锚点不变。无牌遮挡时主按钮中心914，过中心由1058收至1014。满牌的碰撞避让保留。Flex的passMargin抵消多余gap，与布局计算的真实按钮边界一致，避免仅挪动图像而热区仍在旧位置。核对日志.tmp/compact-pass-browser.log。

## 多种动作同时出现

新增合法场景choice=hu-pung/kong-pung/multi-kong：胡+碰+过、杠+碰+过、胡+三种可杠牌。均为144张唯一牌的引擎快照；不直接伪造actions、不修改胡牌/过牌规则。
多个杠沿用带牌面的小标记和tile动作参数，三个杠分别执行对应物理组的测试通过。四个主操作且没有过时允许借用空闲的过按钮区域；拥挤时继续紧凑排布，热区至少44px、相邻至少12px。
修正了极紧凑档的几何预测：pitch必须至少main+12，确保预测边界和CSS flex gap完全相同。
tests/action-crowded.test.ts及table-action-rail.test.ts共16项通过；实际Cocos横屏组合及按压/拒绝回归见.tmp/action-combinations-browser.log，按住后动作更新不换位/不误触发的Chromium/WebKit检查见.tmp/action-combination-input.log。增加组合后每个浏览器包含16次独立场景加载，显式给120秒用例预算，未放宽遮挡断言。
没有擅自给自摸添加业务不支持的pass，也未部署或重打安装包。
