# 混合代码围栏与重复 OpenUI

普通 JavaScript 围栏不得创建渲染岛：

```javascript
root = Card("贷款模拟器", [Text("这只是代码，不应渲染")])
```

第一个 OpenUI 围栏：

```openui-lang
root = Card("贷款模拟器", [Slider("月供", 0, 10, 1, $monthly), Slider("抵押估值", 40, 160, 1, $asset), Slider("折扣率", 40, 100, 1, $haircut), Stack([Text("DTI"), Text(dti, "percent"), Text("覆盖率"), Text(coverage, "decimal"), Text(verdict)])])
$monthly = 5
$asset = 120
$haircut = 75
dti = (8 + 3 + $monthly) / 21
coverage = ($asset * $haircut / 100) / 50
verdict = dti > 0.65 || coverage < 1.2 ? "DECLINE" : "REVIEW"
```

完全相同的第二个 OpenUI 围栏，必须独立创建第二个岛：

```openui-lang
root = Card("贷款模拟器", [Slider("月供", 0, 10, 1, $monthly), Slider("抵押估值", 40, 160, 1, $asset), Slider("折扣率", 40, 100, 1, $haircut), Stack([Text("DTI"), Text(dti, "percent"), Text("覆盖率"), Text(coverage, "decimal"), Text(verdict)])])
$monthly = 5
$asset = 120
$haircut = 75
dti = (8 + 3 + $monthly) / 21
coverage = ($asset * $haircut / 100) / 50
verdict = dti > 0.65 || coverage < 1.2 ? "DECLINE" : "REVIEW"
```

OPENUI_FIXTURE_COMPLETE
