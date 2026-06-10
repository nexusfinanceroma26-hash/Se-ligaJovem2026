const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function getInitialRoute() {
  const route = window.location.hash.replace("#", "").trim();
  const allowed = getAllowedRoutes();
  return allowed.includes(route) ? route : "dashboard";
}

function getAllowedRoutes() {
  return [
    "dashboard", "stock", "sales", "marketplace", "financial", "capital", "payroll",
    "assets", "investors", "assistant", "recommendations", "reports", "settings",
    "customers", "suppliers", "products"
  ];
}

const state = {
  route: getInitialRoute(),
  drawer: null,
  drawerRoute: null,
  editingIndex: null,
  query: "",
  user: readUser(),
};

const menu = [
  ["Gestão", [
    ["dashboard", "Visão Geral", "⌂"],
    ["stock", "Estoque", "▣"],
    ["sales", "Vendas", "◴"],
    ["marketplace", "Marketplace", "▤"],
    ["financial", "Financeiro", "$"],
    ["capital", "Capital de Giro", "↗"],
  ]],
  ["Operação", [
    ["customers", "Clientes", "◎"],
    ["suppliers", "Fornecedores", "◇"],
    ["payroll", "Folha de Pagamento", "▥"],
    ["assets", "Patrimônio", "▧"],
  ]],
  ["Inteligência", [
    ["investors", "Investidores", "◌"],
    ["assistant", "Assistente IA", "✦"],
    ["recommendations", "Recomendações IA", "◈"],
    ["reports", "Relatórios", "▦"],
    ["settings", "Configurações", "⚙"],
  ]],
];

const kpis = [
  { label: "Receita total", value: money.format(486240), delta: "+12,4%", help: "Vendas consolidadas no mês", progress: 78 },
  { label: "Despesas", value: money.format(279880), delta: "-3,1%", help: "Custos operacionais e folha", progress: 54 },
  { label: "Lucro líquido", value: money.format(206360), delta: "+18,9%", help: "Resultado após despesas", progress: 67 },
  { label: "Score financeiro", value: "86/100", delta: "+5 pts", help: "Saúde financeira estimada", progress: 86 },
];

const chart = [
  ["Jan", 52, 34], ["Fev", 61, 41], ["Mar", 72, 48], ["Abr", 68, 51], ["Mai", 84, 49], ["Jun", 92, 57],
];

const seedRows = {
  customers: [
    ["Ana Mercado", "Recorrente", money.format(18420), "Baixo", "42 compras"],
    ["Grupo Costa", "Mais lucrativo", money.format(66810), "Médio", "18 compras"],
    ["Padaria Sol", "Risco de abandono", money.format(9300), "Alto", "64 dias sem compra"],
    ["Bistrô Norte", "Upsell", money.format(22190), "Baixo", "Ticket subindo"],
  ],
  suppliers: [
    ["Alpha Distribuidora", "Insumos", "92/100", "14 dias", "Renegociar frete"],
    ["Beta Embalagens", "Embalagens", "81/100", "7 dias", "Contrato vence em 18 dias"],
    ["Gamma Foods", "Produtos", "74/100", "21 dias", "Atraso recorrente"],
    ["Delta Tech", "Software", "96/100", "Imediato", "OK"],
  ],
  stock: [
    ["CAF-001", "Café premium 500g", "42", "80", money.format(29.9), "Ruptura"],
    ["CHA-014", "Chá verde 30 sachês", "310", "120", money.format(18.5), "OK"],
    ["MEL-220", "Mel silvestre 250g", "76", "60", money.format(24), "Atenção"],
    ["GRA-092", "Granola 1kg", "18", "50", money.format(37.9), "Ruptura"],
  ],
  sales: [
    ["#1029", "Ana Mercado", money.format(1240), "Pago", "18,2% margem"],
    ["#1030", "Grupo Costa", money.format(6190), "Faturado", "23,4% margem"],
    ["#1031", "Padaria Sol", money.format(860), "Pendente", "9,1% margem"],
    ["#1032", "Bistrô Norte", money.format(2140), "Pago", "19,8% margem"],
  ],
  marketplace: [
    ["Mercado Livre", "#ML-8842", money.format(1240), "Enviado", "12,8% margem"],
    ["Shopee", "#SH-1102", money.format(620), "Recebido", "9,4% margem"],
    ["Amazon", "#AM-5520", money.format(3190), "Concluído", "16,1% margem"],
    ["Shopify", "#SP-9011", money.format(860), "Separação", "21,2% margem"],
  ],
  financial: [
    ["08/06", "Venda Grupo Costa", "Receita", money.format(6190), "Pago"],
    ["07/06", "Fornecedor Alpha", "Despesa", money.format(18400), "Pendente"],
    ["06/06", "Folha parcial", "Despesa", money.format(12800), "Pago"],
    ["05/06", "Marketplace Amazon", "Receita", money.format(3190), "Concluído"],
  ],
  capital: [
    ["Antecipar 18% dos recebíveis", money.format(42100), "Médio", "7 dias"],
    ["Renegociar prazo fornecedor Beta", money.format(18500), "Baixo", "14 dias"],
    ["Reduzir estoque parado", money.format(23100), "Médio", "30 dias"],
  ],
  payroll: [
    ["Marina Lopes", "Financeiro", money.format(5200), money.format(7358), "OK"],
    ["Igor Santos", "Operação", money.format(3600), money.format(5126), "Horas extras"],
    ["Clara Nunes", "Vendas", money.format(4100), money.format(6390), "Comissão"],
  ],
  assets: [
    ["Veículo utilitário", "Transporte", money.format(84000), money.format(61420), "Manutenção em 12 dias"],
    ["Notebook equipe", "TI", money.format(46000), money.format(33760), "OK"],
    ["Câmara fria", "Equipamento", money.format(72500), money.format(58510), "Ocioso 34%"],
  ],
  investors: [
    ["Fundo PME Nordeste", "Moderado", money.format(800000), "Alimentos", "91%"],
    ["Anjo Operacional", "Alto", money.format(250000), "Varejo", "84%"],
    ["Credit Partner", "Baixo", money.format(1200000), "Crédito", "78%"],
  ],
};

const rows = loadDatabase(seedRows);

const pageInfo = {
  stock: ["Estoque", "Produtos, mínimo ideal, ruptura, giro e previsão de demanda.", ["SKU", "Produto", "Qtd", "Mínimo", "Preço", "Status"]],
  sales: ["Vendas", "Pedidos, clientes, pagamentos e margem por operação.", ["Pedido", "Cliente", "Valor", "Status", "Performance"]],
  marketplace: ["Marketplace", "Performance por canal e pedidos integrados.", ["Canal", "Pedido", "Valor", "Status", "Performance"]],
  customers: ["Clientes", "Histórico, ticket, frequência, risco e oportunidades.", ["Cliente", "Segmento", "Ticket total", "Risco", "Histórico"]],
  suppliers: ["Fornecedores", "Cotações, prazos, confiabilidade e renegociação.", ["Fornecedor", "Categoria", "Score", "Prazo", "IA"]],
  payroll: ["Folha de Pagamento", "Valores por funcionário, encargos, comissões e custo total.", ["Colaborador", "Área", "Bruto", "Custo empresa", "Alerta"]],
  assets: ["Patrimônio", "Ativos, depreciação, manutenção e valor patrimonial.", ["Ativo", "Categoria", "Valor compra", "Valor atual", "IA"]],
  investors: ["Investidores", "Perfil, compatibilidade, capital e interesse de investimento.", ["Investidor", "Risco", "Capital", "Interesse", "Compatibilidade"]],
};

const drawerSchemas = {
  customers: {
    title: "cliente",
    fields: [
      ["clientName", "Nome do cliente", "Ex: Mercado São João"],
      ["segment", "Segmento", "Ex: Varejo alimentar"],
      ["ticket", "Ticket total estimado", "Ex: 18420"],
      ["risk", "Risco", "Baixo"],
      ["history", "Histórico", "Ex: 12 compras no mês"],
    ],
    risks: ["Baixo", "Médio", "Alto"],
    toRow: (data) => [data.clientName, data.segment, normalizeValue(data.ticket), data.risk, data.history],
    fromRow: (row) => ({ clientName: row[0], segment: row[1], ticket: row[2], risk: row[3], history: row[4] }),
  },
  suppliers: {
    title: "fornecedor",
    fields: [
      ["supplierName", "Nome do fornecedor", "Ex: Alpha Distribuidora"],
      ["category", "Categoria", "Ex: Insumos"],
      ["score", "Score ou preço da cotação", "Ex: 92/100"],
      ["deadline", "Prazo", "Ex: 14 dias"],
      ["recommendation", "Observação da IA", "Ex: Renegociar frete"],
    ],
    toRow: (data) => [data.supplierName, data.category, data.score || "88/100", data.deadline || "14 dias", data.recommendation || "Avaliar cotação"],
    fromRow: (row) => ({ supplierName: row[0], category: row[1], score: row[2], deadline: row[3], recommendation: row[4] }),
  },
  stock: {
    title: "produto",
    fields: [
      ["sku", "SKU", "Ex: CAF-001"],
      ["productName", "Nome do produto", "Ex: Café premium 500g"],
      ["quantity", "Quantidade atual", "Ex: 42"],
      ["minimum", "Estoque mínimo", "Ex: 80"],
      ["price", "Preço de venda", "Ex: 29,90"],
      ["status", "Status", "Atenção"],
    ],
    statusOptions: ["OK", "Atenção", "Ruptura"],
    toRow: (data) => [data.sku || `SKU-${Date.now().toString().slice(-4)}`, data.productName, data.quantity || "0", data.minimum || "0", normalizeValue(data.price), data.status],
    fromRow: (row) => ({ sku: row[0], productName: row[1], quantity: row[2], minimum: row[3], price: row[4], status: row[5] }),
  },
  sales: {
    title: "venda",
    fields: [
      ["order", "Pedido", "Ex: #1033"],
      ["customer", "Cliente", "Ex: Ana Mercado"],
      ["amount", "Valor da venda", "Ex: 1240"],
      ["status", "Status do pagamento", "Pago"],
      ["margin", "Margem", "Ex: 18,2% margem"],
    ],
    statusOptions: ["Pago", "Faturado", "Pendente"],
    toRow: (data) => [data.order || `#${Date.now().toString().slice(-4)}`, data.customer, normalizeValue(data.amount), data.status, data.margin || "18,4% margem"],
    fromRow: (row) => ({ order: row[0], customer: row[1], amount: row[2], status: row[3], margin: row[4] }),
  },
  marketplace: {
    title: "pedido de marketplace",
    fields: [
      ["channel", "Canal", "Ex: Mercado Livre"],
      ["order", "Pedido", "Ex: #ML-8842"],
      ["amount", "Valor do pedido", "Ex: 1240"],
      ["status", "Status", "Recebido"],
      ["performance", "Performance", "Ex: 12,8% margem"],
    ],
    statusOptions: ["Recebido", "Enviado", "Concluído", "Separação"],
    toRow: (data) => [data.channel, data.order || `#MK-${Date.now().toString().slice(-4)}`, normalizeValue(data.amount), data.status, data.performance || "14,2% margem"],
    fromRow: (row) => ({ channel: row[0], order: row[1], amount: row[2], status: row[3], performance: row[4] }),
  },
  financial: {
    title: "lançamento financeiro",
    fields: [
      ["date", "Data", "Ex: 09/06"],
      ["description", "Descrição", "Ex: Venda balcão"],
      ["category", "Categoria", "Receita"],
      ["amount", "Valor", "Ex: 1250"],
      ["status", "Status", "Pago"],
    ],
    categoryOptions: ["Receita", "Despesa"],
    statusOptions: ["Pago", "Pendente", "Concluído", "Atrasado"],
    toRow: (data) => [data.date || currentShortDate(), data.description, data.category || "Receita", normalizeValue(data.amount), data.status || "Pendente"],
    fromRow: (row) => ({ date: row[0], description: row[1], category: row[2], amount: row[3], status: row[4] }),
  },
  capital: {
    title: "ação de capital de giro",
    fields: [
      ["action", "Ação sugerida", "Ex: Antecipar recebíveis"],
      ["impact", "Impacto estimado", "Ex: 42100"],
      ["risk", "Risco", "Médio"],
      ["deadline", "Prazo", "Ex: 7 dias"],
    ],
    risks: ["Baixo", "Médio", "Alto", "Crítico"],
    toRow: (data) => [data.action, normalizeValue(data.impact), data.risk || "Médio", data.deadline || "7 dias"],
    fromRow: (row) => ({ action: row[0], impact: row[1], risk: row[2], deadline: row[3] }),
  },
  payroll: {
    title: "funcionário",
    fields: [
      ["employee", "Funcionário", "Ex: Marina Lopes"],
      ["area", "Área", "Ex: Financeiro"],
      ["gross", "Salário bruto", "Ex: 5200"],
      ["companyCost", "Custo para empresa", "Ex: 7358"],
      ["alert", "Alerta", "OK"],
    ],
    toRow: (data) => [data.employee, data.area, normalizeValue(data.gross), normalizeValue(data.companyCost || parseMoney(data.gross) * 1.38), data.alert || "OK"],
    fromRow: (row) => ({ employee: row[0], area: row[1], gross: row[2], companyCost: row[3], alert: row[4] }),
  },
  assets: {
    title: "patrimônio",
    fields: [
      ["asset", "Ativo", "Ex: Notebook equipe"],
      ["category", "Categoria", "Ex: TI"],
      ["purchaseValue", "Valor de compra", "Ex: 46000"],
      ["currentValue", "Valor atual", "Ex: 33760"],
      ["note", "Observação da IA", "OK"],
    ],
    toRow: (data) => [data.asset, data.category, normalizeValue(data.purchaseValue), normalizeValue(data.currentValue), data.note || "OK"],
    fromRow: (row) => ({ asset: row[0], category: row[1], purchaseValue: row[2], currentValue: row[3], note: row[4] }),
  },
  investors: {
    title: "investidor",
    fields: [
      ["investor", "Investidor", "Ex: Fundo PME Nordeste"],
      ["risk", "Perfil de risco", "Moderado"],
      ["capital", "Capital disponível", "Ex: 800000"],
      ["interest", "Interesse", "Ex: Alimentos"],
      ["match", "Compatibilidade", "Ex: 91%"],
    ],
    risks: ["Baixo", "Moderado", "Alto"],
    toRow: (data) => [data.investor, data.risk, normalizeValue(data.capital), data.interest, data.match || "82%"],
    fromRow: (row) => ({ investor: row[0], risk: row[1], capital: row[2], interest: row[3], match: row[4] }),
  },
};

function readUser() {
  try {
    return enrichUserProfile(JSON.parse(localStorage.getItem("nexfinance_user")) || {});
  } catch {
    return enrichUserProfile({});
  }
}

function enrichUserProfile(user = {}) {
  const emailUsername = String(user.email || "")
    .split("@")[0]
    .replace(/[^a-zA-Z0-9._-]/g, ".")
    .replace(/[.]{2,}/g, ".")
    .replace(/^\.|\.$/g, "");

  const username = user.username || emailUsername || "usuario";
  const displayName = user.displayName || user.name || username || "Usuário Teste";

  return {
    ...user,
    name: displayName,
    username,
    displayName,
    role: user.role || "Admin",
  };
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) node.setAttribute(key, value);
  });
  children.forEach((child) => node.append(child?.nodeType ? child : document.createTextNode(child)));
  return node;
}

function render() {
  const root = document.getElementById("app");
  root.innerHTML = "";
  root.append(app());
}

function app() {
  ensureDemoSession();
  return el("div", { class: "app" }, [
    sidebar(),
    el("main", { class: "main" }, [
      topbar(),
      el("section", { class: "content" }, [page()]),
    ]),
    drawer(),
    el("div", { id: "toast", class: "toast" }),
  ]);
}

function ensureDemoSession() {
  if (!localStorage.getItem("nexfinance_token")) {
    localStorage.setItem("nexfinance_token", "demo-presentation-token");
    localStorage.setItem("nexfinance_user", JSON.stringify({ id: "demo", name: "Usuário Teste", username: "usuario.teste", email: "demo@nexfinance.com" }));
    state.user = readUser();
  }
}

function sidebar() {
  return el("aside", { class: "sidebar", id: "sidebar" }, [
    el("a", { class: "sidebar-brand", href: "dashboard.html" }, [
      el("img", { src: "img/LOGO-NEX.png.png", alt: "NexFinance" }),
    ]),
    el("nav", { class: "nav", "aria-label": "Menu do dashboard" }, menu.flatMap(([title, items]) => [
      el("div", { class: "nav-section" }, [title]),
      ...items.map(([id, label, icon]) => el("button", {
        class: state.route === id ? "active" : "",
        onclick: () => go(id),
      }, [el("span", { class: "nav-icon" }, [icon]), label])),
    ])),
    el("div", { class: "sidebar-user" }, [
      el("div", { class: "avatar" }, [initials(state.user.displayName)]),
      el("div", {}, [el("strong", {}, [state.user.displayName || "Usuário Teste"]), el("span", {}, [`@${state.user.username || "usuario"}`])]),
    ]),
  ]);
}

function topbar() {
  return el("header", { class: "topbar" }, [
    el("button", { class: "btn icon mobile-menu", onclick: toggleMenu, "aria-label": "Abrir menu" }, ["☰"]),
    el("div", { class: "search" }, [
      el("span", {}, ["⌕"]),
      el("input", {
        placeholder: "Buscar clientes, produtos, fornecedores ou relatórios...",
        value: state.query,
        oninput: (event) => {
          state.query = event.target.value;
          filterTables();
        },
      }),
    ]),
    el("div", { class: "top-actions" }, [
      pill("Modo apresentação", "info"),
      btn("Nova ação", "＋", true, () => openDrawer("Nova ação")),
      el("button", { class: "btn danger", onclick: logout }, ["Sair"]),
    ]),
  ]);
}

function page() {
  const pages = {
    dashboard,
    financial,
    capital,
    assistant,
    recommendations,
    reports,
    settings,
  };
  if (pageInfo[state.route]) return dataPage(state.route);
  return (pages[state.route] || dashboard)();
}

function head(title, subtitle, actions = []) {
  return el("div", { class: "page-head" }, [
    el("div", {}, [el("h1", {}, [title]), el("p", {}, [subtitle])]),
    el("div", { class: "actions" }, actions),
  ]);
}

function dashboard() {
  return el("div", { class: "grid" }, [
    head("Visão geral", "Indicadores, alertas e ações prioritárias para apresentar o NexFinance.", [
      btn("Exportar", "⇩", false, () => downloadExecutiveReport()),
      btn("Analisar empresa", "✦", true, () => go("assistant")),
    ]),
    presentationGuide(),
    el("div", { class: "grid cols-4" }, getKpis().map(metric)),
    el("div", { class: "split" }, [
      panel("Fluxo de caixa mensal", chartNode(), "Receitas e despesas consolidadas por mês."),
      panel("Alertas inteligentes", list([
        ["Ruptura iminente", "SKU CAF-001 deve acabar em 6 dias.", pill("Crítico", "bad")],
        ["Capital de giro", "Necessidade estimada de R$ 38.400 em 21 dias.", pill("Atenção", "warn")],
        ["Fornecedor Alpha", "Nova cotação pode reduzir custos em 7,8%.", pill("Oportunidade", "ok")],
      ])),
    ]),
    el("div", { class: "grid cols-3" }, [
      moduleCard("Estoque inteligente", "Dois produtos estão abaixo do mínimo e precisam de reposição.", "Abrir estoque", "stock"),
      moduleCard("Cotações de fornecedores", "Compare preço, prazo e confiabilidade antes de comprar.", "Ver fornecedores", "suppliers"),
      moduleCard("Folha de pagamento", "Gere valores por funcionário e acompanhe custo total.", "Abrir folha", "payroll"),
    ]),
  ]);
}

function metric(item) {
  return el("article", { class: "card metric" }, [
    el("div", { class: "metric-top" }, [el("p", {}, [item.label]), el("span", { class: "delta" + (item.delta.startsWith("-") ? " down" : "") }, [item.delta])]),
    el("div", { class: "metric-value" }, [item.value]),
    el("div", { class: "progress" }, [el("span", { style: `width:${item.progress}%` })]),
    el("p", { class: "mini" }, [item.help]),
  ]);
}

function chartNode() {
  return el("div", {}, [
    el("div", { class: "chart" }, chart.map(([label, revenue, cost]) => el("div", { class: "bar" }, [
      el("i", { style: `height:${revenue * 2}px` }),
      el("b", { style: `height:${cost * 2}px` }),
      el("label", {}, [label]),
    ]))),
    el("div", { class: "actions", style: "margin-top:14px" }, [pill("Receita", "ok"), pill("Despesa", "info"), pill("Atualizado hoje", "warn")]),
  ]);
}

function presentationGuide() {
  return el("section", { class: "presentation-guide" }, [
    el("div", {}, [
      el("span", { class: "status info" }, ["Roteiro para banca"]),
      el("h2", {}, ["Demonstração em 5 passos"]),
      el("p", {}, ["Mostre o problema, cadastre um dado, veja a IA reagir e exporte um relatório. Esse fluxo prova o valor do NexFinance em poucos minutos."]),
    ]),
    el("div", { class: "guide-steps" }, [
      guideStep("1", "Visão geral", "Mostre score, caixa e alertas.", "dashboard"),
      guideStep("2", "Estoque", "Cadastre um produto em risco.", "stock"),
      guideStep("3", "Fornecedores", "Compare prazo, score e cotação.", "suppliers"),
      guideStep("4", "IA", "Explique a recomendação.", "recommendations"),
      guideStep("5", "Relatório", "Baixe o resumo executivo.", "reports"),
    ]),
  ]);
}

function guideStep(number, title, text, route) {
  return el("button", { class: "guide-step", onclick: () => go(route) }, [
    el("strong", {}, [number]),
    el("span", {}, [title]),
    el("small", {}, [text]),
  ]);
}

function dataPage(key) {
  const [title, subtitle, headers] = pageInfo[key];
  return el("div", { class: "grid" }, [
    head(title, subtitle, [
      btn("Novo registro", "＋", true, () => openDrawer(`Novo ${title}`, key)),
      btn("Importar CSV", "⇧", false, () => toast("Importação simulada com sucesso.")),
      btn("Exportar", "⇩", false, () => downloadCsv(title, headers, rows[key])),
    ]),
    tabs(["Todos", "Críticos", "IA sugeriu ação", "Arquivados"]),
    tablePanel(title, headers, rows[key], key),
    el("div", { class: "grid cols-3" }, [
      moduleCard("Automação IA", "Análise diária detecta riscos e oportunidades do módulo.", "Ver IA", "assistant"),
      moduleCard("Relatórios", "Gere PDF e planilhas com os dados filtrados.", "Abrir relatórios", "reports"),
      moduleCard("Configurações", "Ajuste permissões, empresa e preferências.", "Configurar", "settings"),
    ]),
  ]);
}

function financial() {
  const receivable = rows.financial
    .filter((row) => String(row[2]).toLowerCase().includes("receita") && !String(row[4]).toLowerCase().includes("pago"))
    .reduce((total, row) => total + parseMoney(row[3]), 0);
  const payable = rows.financial
    .filter((row) => String(row[2]).toLowerCase().includes("despesa") && !String(row[4]).toLowerCase().includes("pago"))
    .reduce((total, row) => total + parseMoney(row[3]), 0);
  const cashForecast = sumRows(rows.sales, 2) + sumRows(rows.marketplace, 2) + receivable - payable;

  return el("div", { class: "grid" }, [
    head("Financeiro", "Fluxo de caixa, contas a pagar, contas a receber e conciliação.", [btn("Novo lançamento", "＋", true, () => openDrawer("Novo lançamento financeiro", "financial"))]),
    el("div", { class: "grid cols-4" }, [
      metric({ label: "Contas a receber", value: money.format(receivable), delta: "+9,8%", help: "Lançamentos pendentes de receita", progress: Math.min(92, Math.max(24, receivable / 1800)) }),
      metric({ label: "Contas a pagar", value: money.format(payable), delta: payable ? "-2,4%" : "0%", help: "Despesas ainda pendentes", progress: Math.min(92, Math.max(20, payable / 1200)) }),
      metric({ label: "Caixa previsto", value: money.format(cashForecast), delta: cashForecast >= 0 ? "+6,1%" : "-4,8%", help: "Saldo projetado com dados atuais", progress: cashForecast >= 0 ? 76 : 38 }),
      metric({ label: "Inadimplência", value: "3,4%", delta: "-0,7%", help: "Clientes vencidos", progress: 34 }),
    ]),
    tablePanel("Lançamentos recentes", ["Data", "Descrição", "Categoria", "Valor", "Status"], rows.financial, "financial"),
  ]);
}

function capital() {
  const gap = calculateWorkingCapitalGap();

  return el("div", { class: "grid" }, [
    head("Capital de Giro", "Liquidez, ciclo financeiro, necessidade de caixa e simulações.", [btn("Nova ação", "◇", true, () => openDrawer("Ação de capital de giro", "capital"))]),
    el("div", { class: "grid cols-4" }, [
      metric({ label: "Liquidez corrente", value: "1,42", delta: "+0,08", help: "Ativo circulante / passivo", progress: 71 }),
      metric({ label: "Ciclo financeiro", value: "37 dias", delta: "-4 dias", help: "Estoque + recebimento - pagamento", progress: 63 }),
      metric({ label: "Gap projetado", value: money.format(gap), delta: "D+21", help: "Necessidade estimada com dados atuais", progress: Math.min(84, Math.max(24, gap / 1000)) }),
      metric({ label: "Cobertura", value: "4,1x", delta: "Saudável", help: "EBIT / juros", progress: 82 }),
    ]),
    tablePanel("Plano de ação", ["Ação sugerida", "Impacto", "Risco", "Prazo"], rows.capital, "capital"),
  ]);
}

function assistant() {
  return el("div", { class: "grid" }, [
    head("Assistente IA", "Perguntas contextualizadas sobre caixa, vendas, estoque e risco.", [btn("Gerar relatório", "▦", false, () => go("reports"))]),
    el("div", { class: "split" }, [
      el("section", { class: "panel chat" }, [
        el("div", { class: "panel-head" }, [el("h2", {}, ["Copiloto financeiro"]), pill("Dados da empresa", "info")]),
        el("div", { class: "messages", id: "messages" }, [
          msg("Analisei caixa, estoque e fornecedores. A maior oportunidade está em renegociar Alpha e ajustar o estoque de CAF-001."),
          msg("E se eu aumentar preços nos produtos de maior giro?", true),
          msg("Impacto estimado: +R$ 31.200 em receita mensal, com risco médio de queda de 4% no volume. Teste recomendado: aumento de 6% por 14 dias."),
        ]),
        el("form", { class: "composer", onsubmit: sendAi }, [
          el("input", { id: "aiInput", placeholder: "Pergunte sobre caixa, estoque, risco ou vendas..." }),
          el("button", { class: "btn primary" }, ["Enviar"]),
        ]),
      ]),
      panel("Recomendações ativas", list([
        ["Renegociar fornecedor Alpha", "Economia potencial de R$ 9.800/mês.", pill("Alto impacto", "ok")],
        ["Antecipar recebíveis seletivamente", "Cobrir gap de caixa em D+21.", pill("Risco médio", "warn")],
        ["Campanha Padaria Sol", "Cliente com risco de abandono.", pill("CRM", "info")],
      ])),
    ]),
  ]);
}

function recommendations() {
  const smartRecommendations = buildSmartRecommendations();

  return el("div", { class: "grid" }, [
    head("Recomendações IA", "Ações priorizadas para melhorar caixa, margem e operação.", [btn("Atualizar com Gemini", "↻", true, updateAiRecommendations)]),
    el("div", { id: "aiRecommendationBox" }),
    tablePanel("Fila de recomendações", ["Prioridade", "Recomendação", "Impacto", "Risco", "Ação"], smartRecommendations),
  ]);
}

function reports() {
  return el("div", { class: "grid" }, [
    head("Relatórios", "PDF, planilhas e visão executiva para apresentação.", [btn("Baixar relatório", "⇩", true, () => downloadExecutiveReport()), btn("Agendar envio", "◷", false, () => openDrawer("Agendar relatório", "reports"))]),
    el("div", { class: "kanban" }, [
      lane("Prontos", ["DRE gerencial - Maio", "Fluxo de caixa 30 dias", "Estoque crítico"]),
      lane("Agendados", ["Análise semanal IA", "LGPD mensal", "Marketplace performance"]),
      lane("Em geração", ["Relatório executivo", "Auditoria de permissões"]),
    ]),
  ]);
}

function settings() {
  return el("div", { class: "grid" }, [
    head("Configurações", "Empresa, usuários, permissões e preferências da plataforma.", [
      btn("Restaurar demo", "↻", false, resetDemoData),
      btn("Salvar alterações", "✓", true, () => toast("Configurações salvas.")),
    ]),
    el("div", { class: "grid cols-2" }, [
      panel("Dados da empresa", formFields(["Nome da empresa", "CNPJ", "Segmento", "Cidade"])),
      panel("Permissões", list([
        ["Administrador", "Acesso completo ao dashboard e configurações.", pill("Ativo", "ok")],
        ["Operador", "Acesso a estoque, vendas, clientes e fornecedores.", pill("Ativo", "ok")],
        ["Investidor", "Acesso somente leitura a relatórios liberados.", pill("Limitado", "warn")],
      ])),
    ]),
  ]);
}

function panel(title, body, foot) {
  return el("section", { class: "panel" }, [
    el("div", { class: "panel-head" }, [el("h2", {}, [title])]),
    body?.nodeType ? body : el("div", {}, [body]),
    foot ? el("p", { class: "mini", style: "margin-top:12px" }, [foot]) : "",
  ]);
}

function tablePanel(title, headers, data, route = null) {
  const tableHeaders = route ? [...headers, "Ações"] : headers;

  return panel(title, el("div", { class: "table-wrap" }, [
    el("table", { "data-filterable": "true" }, [
      el("thead", {}, [el("tr", {}, tableHeaders.map((header) => el("th", {}, [header])))]),
      el("tbody", {}, data.map((row, index) => el("tr", {}, [
        ...row.map((cellValue) => el("td", { html: cell(cellValue) })),
        ...(route ? [el("td", {}, [rowActions(route, index)])] : []),
      ]))),
    ]),
  ]));
}

function cell(value) {
  const text = String(value);
  const normalized = text.toLowerCase();
  if (["ok", "baixo", "pago", "concluído", "enviado"].includes(normalized)) return `<span class="status ok">${text}</span>`;
  if (["médio", "atenção", "pendente", "recebido", "separação"].includes(normalized)) return `<span class="status warn">${text}</span>`;
  if (["alto", "ruptura", "alta"].includes(normalized)) return `<span class="status bad">${text}</span>`;
  return text;
}

function rowActions(route, index) {
  return el("div", { class: "row-actions" }, [
    el("button", { class: "table-action", onclick: () => editRecord(route, index) }, ["Editar"]),
    el("button", { class: "table-action danger", onclick: () => deleteRecord(route, index) }, ["Excluir"]),
  ]);
}

function list(items) {
  return el("div", { class: "list" }, items.map(([title, text, badge]) => el("div", { class: "item" }, [
    el("div", {}, [el("strong", {}, [title]), el("p", {}, [text])]),
    badge || "",
  ])));
}

function tabs(labels) {
  return el("div", { class: "tabs" }, labels.map((label, index) => el("button", {
    class: "tab" + (index === 0 ? " active" : ""),
    onclick: (event) => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      event.currentTarget.classList.add("active");
      toast(`Filtro "${label}" aplicado.`);
    },
  }, [label])));
}

function moduleCard(title, text, action, route) {
  return el("article", { class: "card" }, [
    el("h2", {}, [title]),
    el("p", { style: "margin:8px 0 16px" }, [text]),
    btn(action, "→", false, () => go(route)),
  ]);
}

function lane(title, cards) {
  return el("section", { class: "lane" }, [
    el("h2", {}, [title]),
    ...cards.map((card) => el("div", { class: "item" }, [
      el("div", {}, [el("strong", {}, [card]), el("p", {}, ["Atualizado hoje"])]),
      pill("Ativo", "info"),
    ])),
  ]);
}

function formFields(labels) {
  return el("div", { class: "form" }, labels.map((label) => el("div", { class: "field" }, [
    el("label", {}, [label]),
    el("input", { value: label === "Nome da empresa" ? "NexFoods Comércio LTDA" : "" }),
  ])));
}

function drawer() {
  const route = state.drawerRoute || state.route;
  const currentRow = state.editingIndex != null ? rows[route]?.[state.editingIndex] : null;
  const schema = drawerSchemas[route];
  const values = schema && currentRow ? schema.fromRow(currentRow) : {};

  return el("aside", { class: "drawer" + (state.drawer ? " open" : ""), "aria-label": "Painel de ação" }, [
    el("div", { class: "panel-head" }, [
      el("h2", {}, [state.drawer || "Ação"]),
      el("button", { class: "btn icon", onclick: closeDrawer, "aria-label": "Fechar" }, ["×"]),
    ]),
    el("div", { class: "form", id: "drawerForm" }, [
      ...(schema ? schema.fields.map(([name, label, placeholder]) => schemaField(route, name, label, placeholder, values[name])) : [
        field("Nome", "text", ""),
        field("Categoria", "text", ""),
        field("Valor", "text", ""),
        el("div", { class: "field" }, [el("label", {}, ["Observações"]), el("textarea", { name: "notes", placeholder: "Detalhe a ação..." })]),
      ]),
      el("button", { class: "btn primary", onclick: saveDrawerRecord }, [state.editingIndex != null ? "Salvar alterações" : "Salvar"]),
    ]),
  ]);
}

function field(label, type, value) {
  return el("div", { class: "field" }, [el("label", {}, [label]), el("input", { type, value })]);
}

function schemaField(route, name, label, placeholder, value = "") {
  const schema = drawerSchemas[route];
  const options = name === "risk"
    ? schema.risks
    : name === "status"
      ? schema.statusOptions
      : name === "category"
        ? schema.categoryOptions
        : null;

  if (options) {
    return el("div", { class: "field" }, [
      el("label", {}, [label]),
      el("select", { name }, options.map((option) => el("option", { value: option, selected: option === value || (!value && option === placeholder) }, [option]))),
    ]);
  }

  return el("div", { class: "field" }, [
    el("label", {}, [label]),
    el("input", { name, type: inferInputType(name), value, placeholder }),
  ]);
}

function inferInputType(name) {
  return ["ticket", "amount", "quantity", "minimum", "price", "gross", "companyCost", "purchaseValue", "currentValue", "capital"].includes(name) ? "text" : "text";
}

function pill(text, tone) {
  return el("span", { class: `status ${tone}` }, [text]);
}

function btn(text, icon, primary, onclick) {
  return el("button", { class: `btn${primary ? " primary" : ""}`, onclick }, [el("span", {}, [icon]), text]);
}

function msg(text, user = false) {
  return el("div", { class: "msg" + (user ? " user" : " assistant") }, [formatAiText(text)]);
}

function formatAiText(text = "") {
  return String(text)
    .replace(/^#{1,4}\s*/gm, "")
    .replace(/\*\*/g, "")
    .trim();
}

async function sendAi(event) {
  event.preventDefault();
  const input = document.getElementById("aiInput");
  if (!input.value.trim()) return;
  const box = document.getElementById("messages");
  const question = input.value.trim();
  box.append(msg(question, true));
  input.value = "";

  const loading = msg("Nexy está lendo sua pergunta...");
  box.append(loading);

  try {
    const response = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("nexfinance_token") || "demo-presentation-token"}`,
      },
      body: JSON.stringify({
        module: state.route,
        question,
        data: getAiPayload(),
      }),
    });

    const result = await response.json();
    loading.textContent = result.answer || "Não foi possível gerar a análise agora.";
    loading.textContent = formatAiText(loading.textContent);
  } catch (error) {
    console.error("Erro ao chamar IA:", error);
    loading.textContent = "A IA real não respondeu agora. Sugestão: revise estoque, caixa e fornecedores antes da próxima compra.";
  }
}

function go(route) {
  if (!getAllowedRoutes().includes(route)) return;
  state.route = route;
  state.drawer = null;
  state.drawerRoute = null;
  state.editingIndex = null;
  document.getElementById("sidebar")?.classList.remove("open");
  if (window.location.hash !== `#${route}`) {
    window.history.pushState(null, "", `#${route}`);
  }
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openDrawer(title, route = state.route) {
  state.drawer = title;
  state.drawerRoute = route;
  state.editingIndex = null;
  render();
}

function closeDrawer() {
  state.drawer = null;
  state.drawerRoute = null;
  state.editingIndex = null;
  render();
}

function toggleMenu() {
  document.getElementById("sidebar")?.classList.toggle("open");
}

window.addEventListener("hashchange", () => {
  const route = getInitialRoute();
  if (route !== state.route) {
    state.route = route;
    state.drawer = null;
    state.drawerRoute = null;
    state.editingIndex = null;
    render();
  }
});

window.addEventListener("popstate", () => {
  const route = getInitialRoute();
  if (route !== state.route) {
    state.route = route;
    state.drawer = null;
    state.drawerRoute = null;
    state.editingIndex = null;
    render();
  }
});

function filterTables() {
  const query = state.query.trim().toLowerCase();
  document.querySelectorAll("table[data-filterable] tbody tr").forEach((row) => {
    row.style.display = row.textContent.toLowerCase().includes(query) ? "" : "none";
  });
}

function toast(message) {
  const box = document.getElementById("toast");
  if (!box) return;
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => box.classList.remove("show"), 2200);
}

function logout() {
  localStorage.removeItem("nexfinance_token");
  localStorage.removeItem("nexfinance_user");
  window.location.href = "login.html";
}

function initials(name = "Usuário Teste") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function loadDatabase(seed) {
  try {
    const saved = JSON.parse(localStorage.getItem("nexfinance_demo_database") || "null");
    return saved || structuredClone(seed);
  } catch {
    return JSON.parse(JSON.stringify(seed));
  }
}

function saveDatabase() {
  localStorage.setItem("nexfinance_demo_database", JSON.stringify(rows));
}

function saveDrawerRecord(event) {
  event.preventDefault();

  const form = document.getElementById("drawerForm");
  const route = state.drawerRoute || state.route;
  const schema = drawerSchemas[route];
  const formData = form ? new FormData(form) : new FormData();
  const data = Object.fromEntries(formData.entries());

  if (!schema) {
    closeDrawer();
    toast("Ação registrada para apresentação.");
    return;
  }

  const firstField = schema.fields[0][0];
  if (!String(data[firstField] || "").trim()) {
    toast(`Informe ${schema.fields[0][1].toLowerCase()}.`);
    return;
  }

  const row = schema.toRow(data);

  if (state.editingIndex != null) {
    rows[route][state.editingIndex] = row;
  } else {
    rows[route] = [row, ...rows[route]];
  }

  saveDatabase();
  closeDrawer();
  toast(state.editingIndex != null ? "Registro atualizado." : "Registro salvo e tabela atualizada.");
}

function normalizeValue(value) {
  const numeric = parseMoney(value);
  if (!numeric) return value;
  return money.format(numeric);
}

function editRecord(route, index) {
  const [title] = pageInfo[route] || ["Registro"];
  state.drawer = `Editar ${title}`;
  state.drawerRoute = route;
  state.editingIndex = index;
  render();
}

function deleteRecord(route, index) {
  const deleted = rows[route]?.[index];
  if (!deleted) return;
  if (!window.confirm("Deseja excluir este registro?")) return;

  rows[route].splice(index, 1);
  saveDatabase();
  render();
  toast("Registro excluído.");
}

function getKpis() {
  const salesTotal = sumRows(rows.sales, 2) + sumRows(rows.marketplace, 2);
  const payrollTotal = sumRows(rows.payroll, 3);
  const financialRevenue = rows.financial
    .filter((row) => String(row[2]).toLowerCase().includes("receita"))
    .reduce((total, row) => total + parseMoney(row[3]), 0);
  const financialExpense = rows.financial
    .filter((row) => String(row[2]).toLowerCase().includes("despesa"))
    .reduce((total, row) => total + parseMoney(row[3]), 0);
  const stockRisk = rows.stock.filter((row) => String(row[5]).toLowerCase().includes("ruptura")).length;
  const expenses = payrollTotal + financialExpense + 84200;
  const revenue = Math.max(salesTotal * 18 + financialRevenue, 486240);
  const profit = revenue - expenses;
  const score = Math.max(62, Math.min(96, 88 - stockRisk * 4 + (profit > 0 ? 2 : -10)));

  return [
    { label: "Receita total", value: money.format(revenue), delta: "+12,4%", help: "Vendas e marketplace consolidados", progress: 78 },
    { label: "Despesas", value: money.format(expenses), delta: "-3,1%", help: "Custos operacionais e folha", progress: 54 },
    { label: "Lucro líquido", value: money.format(profit), delta: profit >= 0 ? "+18,9%" : "-8,2%", help: "Resultado estimado do mês", progress: profit >= 0 ? 67 : 38 },
    { label: "Score financeiro", value: `${score}/100`, delta: `${stockRisk ? "-" : "+"}${stockRisk || 5} pts`, help: "Impacto de caixa, estoque e margem", progress: score },
  ];
}

function sumRows(data, index) {
  return data.reduce((total, row) => total + parseMoney(row[index]), 0);
}

function parseMoney(value) {
  const numeric = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(numeric) || 0;
}

function currentShortDate() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function calculateWorkingCapitalGap() {
  const payable = rows.financial
    .filter((row) => String(row[2]).toLowerCase().includes("despesa") && !String(row[4]).toLowerCase().includes("pago"))
    .reduce((total, row) => total + parseMoney(row[3]), 0);
  const receivable = rows.financial
    .filter((row) => String(row[2]).toLowerCase().includes("receita") && !String(row[4]).toLowerCase().includes("pago"))
    .reduce((total, row) => total + parseMoney(row[3]), 0);
  const stockReplacement = rows.stock
    .filter((row) => String(row[5]).toLowerCase().includes("ruptura"))
    .reduce((total, row) => total + parseMoney(row[4]) * Math.max(0, Number(row[3]) - Number(row[2])), 0);

  return Math.max(0, payable + stockReplacement - receivable);
}

function downloadCsv(title, headers, data) {
  const rowsToExport = [headers, ...data];
  const csv = rowsToExport
    .map((row) => row.map((item) => `"${String(item).replace(/"/g, '""')}"`).join(";"))
    .join("\n");

  downloadFile(`${slug(title)}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
  toast(`${title} exportado em CSV.`);
}

function downloadExecutiveReport() {
  const recommendations = buildSmartRecommendations();
  const content = [
    "Relatório Executivo NexFinance",
    "",
    ...getKpis().map((item) => `${item.label}: ${item.value} (${item.delta})`),
    "",
    "Recomendações principais:",
    ...recommendations.map((item) => `- ${item[1]} Impacto estimado: ${item[2]}. Risco: ${item[3]}.`),
  ].join("\n");

  downloadFile("relatorio-executivo-nexfinance.txt", content, "text/plain;charset=utf-8");
  toast("Relatório executivo baixado.");
}

function buildSmartRecommendations() {
  const ruptureCount = rows.stock.filter((row) => String(row[5]).toLowerCase().includes("ruptura")).length;
  const weakSuppliers = rows.suppliers.filter((row) => parseInt(row[2], 10) < 85).length;
  const riskyCustomers = rows.customers.filter((row) => String(row[3]).toLowerCase().includes("alto")).length;
  const payrollCost = sumRows(rows.payroll, 3);
  const workingCapitalGap = calculateWorkingCapitalGap();

  const recommendations = [];

  if (ruptureCount) {
    recommendations.push(["Alta", `Repor ${ruptureCount} produto(s) em ruptura antes do fim de semana`, money.format(ruptureCount * 16400), "Médio", "Gerar compra"]);
  }

  if (weakSuppliers) {
    recommendations.push(["Alta", "Abrir cotação com fornecedores alternativos", money.format(weakSuppliers * 9800), "Baixo", "Abrir cotação"]);
  }

  if (riskyCustomers) {
    recommendations.push(["Média", "Criar campanha de recuperação para clientes em risco", money.format(riskyCustomers * 7200), "Baixo", "Criar ação"]);
  }

  if (payrollCost > 12000) {
    recommendations.push(["Média", "Revisar folha e comissões antes do fechamento mensal", money.format(payrollCost * 0.08), "Baixo", "Abrir folha"]);
  }

  if (workingCapitalGap > 0) {
    recommendations.push(["Alta", "Acompanhar gap de capital de giro antes de novas compras", money.format(workingCapitalGap), workingCapitalGap > 30000 ? "Alto" : "Médio", "Abrir capital"]);
  }

  recommendations.push(["Média", "Gerar relatório executivo para acompanhar evolução semanal", money.format(0), "Baixo", "Baixar relatório"]);

  return recommendations;
}

function getAiPayload() {
  const businessProfile = readBusinessProfile();

  return {
    empresa: state.user?.company || "NexFoods Comércio LTDA",
    periodo: "Junho/2026",
    perfilNegocio: businessProfile,
    financeiro: getKpis().map((item) => ({
      indicador: item.label,
      valor: item.value,
      variacao: item.delta,
      observacao: item.help,
    })),
    lancamentosFinanceiros: rows.financial,
    capitalDeGiro: {
      gapProjetado: money.format(calculateWorkingCapitalGap()),
      planoDeAcao: rows.capital,
    },
    vendas: rows.sales,
    marketplace: rows.marketplace,
    estoque: rows.stock,
    clientes: rows.customers,
    fornecedores: rows.suppliers,
    folha: rows.payroll,
    patrimonio: rows.assets,
    investidores: rows.investors,
  };
}

function readBusinessProfile() {
  try {
    return JSON.parse(localStorage.getItem("nexfinance_business_profile") || localStorage.getItem("nexfinance_investor_profile") || "{}");
  } catch {
    return {};
  }
}

async function updateAiRecommendations() {
  const box = document.getElementById("aiRecommendationBox");
  if (box) {
    box.innerHTML = "";
    box.append(panel("Análise Gemini", el("p", {}, ["Gerando recomendações com base nos dados atuais..."])));
  }

  try {
    const response = await fetch("/api/ai/recommendations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("nexfinance_token") || "demo-presentation-token"}`,
      },
      body: JSON.stringify({
        data: getAiPayload(),
      }),
    });

    const result = await response.json();
    const recommendations = result.recommendations || [];
    renderAiRecommendationBox(result.answer, recommendations, result.provider);
  } catch (error) {
    console.error("Erro ao atualizar recomendações IA:", error);
    renderAiRecommendationBox("", buildDemoRecommendationObjects(), "demo");
  }
}

function renderAiRecommendationBox(answer, recommendations, provider) {
  const box = document.getElementById("aiRecommendationBox");
  if (!box) return;

  box.innerHTML = "";

  if (answer) {
    box.append(panel(`Análise ${provider === "gemini" ? "Gemini" : "Demo"}`, el("pre", { class: "ai-answer" }, [answer])));
    return;
  }

  box.append(panel(`Análise ${provider === "gemini" ? "Gemini" : "Demo"}`, list(
    recommendations.map((item) => [
      item.problema || "Recomendação",
      `${item.acao_recomendada || ""} Próximo passo: ${item.proximo_passo || ""}`,
      pill(item.prioridade || "Média", item.prioridade === "Alta" || item.prioridade === "Crítica" ? "bad" : "warn"),
    ]),
  )));
}

function buildDemoRecommendationObjects() {
  return buildSmartRecommendations().map((row) => ({
    prioridade: row[0],
    problema: row[1],
    impacto: row[2],
    risco: row[3],
    acao_recomendada: row[4],
    proximo_passo: "Revise o módulo indicado e execute a ação sugerida.",
  }));
}

function resetDemoData() {
  localStorage.removeItem("nexfinance_demo_database");
  Object.keys(rows).forEach((key) => {
    rows[key] = JSON.parse(JSON.stringify(seedRows[key]));
  });
  render();
  toast("Dados de demonstração restaurados.");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slug(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

render();
