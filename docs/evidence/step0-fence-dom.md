# 第 0 步：真实 assistant 代码块 DOM

隔离 DSH 0.2.1-rc.1、假 provider，无 OpenUI 插件。原生 UI 发起一次请求，callsFile +1。

流式期间观察到 data-streaming：false。该 fixture 仅正文，无 reasoning；reasoning/空围栏未验证。

## outerHTML

```html
<div class="_block_7gxqk_4 md-code-block _card_7gxqk_107" data-code-wrap="true"><div class="_bannerWrap_7gxqk_24"><div class="_header_1pq26_10" data-code-block-banner="true"><div class="_heading_1pq26_23"><span class="_language_1pq26_30">Code block</span></div><div class="_actions_1pq26_43"><button type="button" class="_action_1pq26_43" aria-label="Wrap lines" aria-pressed="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 15H1V1H2V15Z" fill="currentColor"></path><path d="M12.3535 7.64645C12.5487 7.84171 12.5487 8.15829 12.3535 8.35355L9.85352 10.8535L9.14648 10.1465L10.793 8.5H3.5V7.5H10.793L9.14648 5.85352L9.85352 5.14648L12.3535 7.64645Z" fill="currentColor"></path><path d="M15 15H14V1H15V15Z" fill="currentColor"></path></svg></button><button type="button" class="_action_1pq26_43" aria-label="Copy"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-width="1"><rect x="1.52075" y="4.07373" width="10.3932" height="10.3932" rx="2" stroke="currentColor"></rect><path d="M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z" fill="currentColor"></path></svg></button></div></div></div><div class="_content_7gxqk_74" data-code-block-content="true"><pre class="_plain_7gxqk_103"><code>root = Card("贷款模拟器", [Text("准备就绪")])</code></pre></div></div>
```

## 祖先属性

```json
[
  {
    "tag": "CODE",
    "attrs": []
  },
  {
    "tag": "PRE",
    "attrs": [
      [
        "class",
        "_plain_7gxqk_103"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "_content_7gxqk_74"
      ],
      [
        "data-code-block-content",
        "true"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "_block_7gxqk_4 md-code-block _card_7gxqk_107"
      ],
      [
        "data-code-wrap",
        "true"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "_markdown_1ypvv_5"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "hWmORq_body"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "hWmORq_root"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "data-slot",
        "conversation.chat.node"
      ],
      [
        "style",
        "display: contents;"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "EvIC1a_flowItem"
      ],
      [
        "data-chat-anchor-key",
        "14:assistant-step1:1"
      ],
      [
        "data-chat-flow-key",
        "14:assistant-step1:1"
      ],
      [
        "data-chat-paging-anchor",
        "true"
      ],
      [
        "data-chat-node-key",
        "14:assistant-step1:1"
      ],
      [
        "data-chat-group-part",
        "response"
      ],
      [
        "data-chat-flow-kind",
        "assistant-step"
      ],
      [
        "data-chat-turn",
        "1"
      ],
      [
        "data-turn-process-answer",
        "true"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "data-slot",
        "conversation.chat.flow"
      ],
      [
        "style",
        "display: contents;"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "EvIC1a_column"
      ],
      [
        "data-chat-flow",
        ""
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "EvIC1a_scroll"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "EvIC1a_root"
      ],
      [
        "data-chat-following-tail",
        ""
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "EvIC1a_frame"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "data-slot",
        "conversation.view"
      ],
      [
        "style",
        "display: contents;"
      ]
    ]
  },
  {
    "tag": "DIV",
    "attrs": [
      [
        "class",
        "wSkVaW_viewArea"
      ]
    ]
  }
]
```

![原生围栏](step0-fence-dom.png)
