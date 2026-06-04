const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const state = {
  route: "dashboard",
  authed: Boolean(localStorage.getItem("nexfinance_token")),
  drawer: null,
  role: (JSON.parse(localStorage.getItem("nexfinance_user") || "{}").role || "OWNER"),
  company: "NexFinance",
  user: JSON.parse(localStorage.getItem("nexfinance_user") || "{}"),
};

const modules = [
  ["Visão geral", [["dashboard", "Dashboard", "⌂"], ["ai", "Assistente IA", "✦"], ["capital", "Capital de giro", "↻"]]],
  ["Operação", [["customers", "Clientes", "◎"], ["suppliers", "Fornecedores", "◈"], ["stock", "Estoque", "▦"], ["marketplace", "Marketplace", "▤"]]],
  ["Gestão", [["payroll", "Folha", "▥"], ["assets", "Patrimônio", "▧"], ["investors", "Investidores", "◇"], ["reports", "Relatórios", "▣"]]],
  ["Admin", [["security", "RBAC e LGPD", "◐"], ["roadmap", "Roadmap", "→"]]],
];

const kpis = [
  { label: "Receita total", value: money.format(486240), delta: "+12,4%", help: "sales + cashflow_entries", progress: 78 },
  { label: "Despesas totais", value: money.format(279880), delta: "-3,1%", down: false, help: "cashflow + payrolls", progress: 54 },
  { label: "Lucro líquido", value: money.format(206360), delta: "+18,9%", help: "receita - despesas", progress: 67 },
  { label: "Score financeiro", value: "86/100", delta: "+5 pts", help: "motor de IA semanal", progress: 86 },
];

const chart = [
  ["Jan", 52, 34], ["Fev", 61, 41], ["Mar", 72, 48], ["Abr", 68, 51], ["Mai", 84, 49], ["Jun", 92, 57],
];

const alerts = [
  ["Ruptura iminente", "SKU CAF-001 deve acabar em 6 dias.", "bad"],
  ["Capital de giro", "Necessidade estimada de R$ 38.400 em 21 dias.", "warn"],
  ["Oportunidade IA", "Renegociar fornecedor Alpha pode economizar 7,8%.", "info"],
  ["LGPD", "Exportação de dados pronta para auditoria mensal.", "ok"],
];

const customerRows = [
  ["Ana Mercado", "Recorrente", money.format(18420), "Baixo", "42 compras"],
  ["Grupo Costa", "Mais lucrativo", money.format(66810), "Médio", "18 compras"],
  ["Padaria Sol", "Risco de abandono", money.format(9300), "Alto", "64 dias sem compra"],
  ["Bistro Norte", "Upsell", money.format(22190), "Baixo", "ticket subindo"],
];

const supplierRows = [
  ["Alpha Distribuidora", "Insumos", "92", "14 dias", "Renegociar frete"],
  ["Beta Embalagens", "Embalagens", "81", "7 dias", "Contrato vence em 18 dias"],
  ["Gamma Foods", "Produtos", "74", "21 dias", "Atraso recorrente"],
  ["Delta Tech", "Software", "96", "Imediato", "OK"],
];

const stock = [
  ["CAF-001", "Cafe premium 500g", 42, 80, money.format(29.9), "Ruptura"],
  ["CHA-014", "Cha verde 30 sachês", 310, 120, money.format(18.5), "OK"],
  ["MEL-220", "Mel silvestre 250g", 76, 60, money.format(24.0), "Atenção"],
  ["GRA-092", "Granola 1kg", 18, 50, money.format(37.9), "Ruptura"],
];

const orders = [
  ["Mercado Livre", "#ML-8842", money.format(1240), "Enviado", "12,8% margem"],
  ["Shopee", "#SH-1102", money.format(620), "Recebido", "9,4% margem"],
  ["Amazon", "#AM-5520", money.format(3190), "Concluido", "16,1% margem"],
  ["Shopify", "#SP-9011", money.format(860), "Separação", "21,2% margem"],
];

const employees = [
  ["Marina Lopes", "Financeiro", money.format(5200), money.format(7358), "OK"],
  ["Igor Santos", "Operação", money.format(3600), money.format(5126), "Horas extras"],
  ["Clara Nunes", "Vendas", money.format(4100), money.format(6390), "Comissao"],
];

const assets = [
  ["Veículo utilitário", "Transporte", money.format(84000), money.format(61420), "Manutenção em 12 dias"],
  ["Notebook equipe", "TI", money.format(46000), money.format(33760), "OK"],
  ["Camara fria", "Equipamento", money.format(72500), money.format(58510), "Ocioso 34%"],
];

const investors = [
  ["Fundo PME Nordeste", "Moderado", money.format(800000), "Alimentos", "91%"],
  ["Anjo Operacional", "Alto", money.format(250000), "Varejo", "84%"],
  ["Credit Partner", "Baixo", money.format(1200000), "Crédito", "78%"],
];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  });
  children.forEach((child) => node.append(child?.nodeType ? child : document.createTextNode(child)));
  return node;
}

function app() {
  if (!state.authed) {
    window.location.href = "login.html";
    return el("div", { class: "empty" }, ["Redirecionando para o login..."]);
  }
  return el("div", { class: "app" }, [sidebar(), el("main", { class: "main" }, [topbar(), el("section", { class: "content" }, [page()]), drawer()])]);
}

function brand(light) {
  return el("div", { class: "brand" }, [
    el("div", { class: "mark" }, ["N"]),
    el("div", {}, [el("strong", {}, ["NexFinance"]), el("span", {}, ["Seu sucesso, nossa inteligência"])]),
  ]);
}

function sidebar() {
  return el("aside", { class: "sidebar", id: "sidebar" }, [
    brand(true),
    el("nav", { class: "nav" }, modules.flatMap(([title, items]) => [
      el("div", { class: "nav-section" }, [title]),
      ...items.map(([id, label, icon]) => el("button", { class: state.route === id ? "active" : "", onclick: () => { state.route = id; closeMenu(); render(); } }, [el("span", { class: "ico" }, [icon]), label])),
    ])),
  ]);
}

function topbar() {
  return el("header", { class: "topbar" }, [
    el("button", { class: "btn icon mobile-menu", onclick: toggleMenu, title: "Menu" }, ["☰"]),
    el("div", { class: "search" }, [el("span", {}, ["⌕"]), el("input", { placeholder: "Buscar clientes, SKUs, pedidos, recomendações..." })]),
    el("div", { class: "top-actions" }, [
      el("span", { class: "chip" }, [state.company]),
      pill(state.role, "info"),
      el("button", { class: "btn icon", onclick: () => openDrawer("Nova ação"), title: "Nova ação" }, ["+"]),
      el("button", { class: "btn", onclick: logout }, ["Sair"]),
      el("div", { class: "avatar" }, [getInitials()]),
    ]),
  ]);
}

function page() {
  const pages = { dashboard, ai, capital, customers, suppliers, stock: stockPage, marketplace, payroll, assets: assetsPage, investors: investorsPage, reports, security, roadmap };
  return pages[state.route]();
}

function head(title, subtitle, actions = []) {
  return el("div", { class: "page-head" }, [
    el("div", {}, [el("h1", {}, [title]), el("p", {}, [subtitle])]),
    el("div", { class: "actions" }, actions),
  ]);
}

function dashboard() {
  return el("div", { class: "grid" }, [
    head("Dashboard geral", "Indicadores em tempo real, alertas críticos e insights acionáveis da IA.", [btn("Exportar", "⇩"), btn("Analisar empresa", "✦", true, () => { state.route = "ai"; render(); })]),
    el("div", { class: "grid cols-4" }, kpis.map(metric)),
    el("div", { class: "split" }, [
      panel("Fluxo de caixa mensal", chartNode(), "Receitas e despesas consolidadas por cashflow_entries e sales."),
      panel("Alertas inteligentes", list(alerts.map(([a,b,c]) => [a,b,pill(c === "bad" ? "crítico" : c === "warn" ? "atenção" : c === "ok" ? "ok" : "IA", c)]))),
    ]),
    el("div", { class: "grid cols-3" }, [
      moduleCard("Clientes em risco", "3 contas com redução de frequência. IA sugere campanha de recuperação.", "Ver CRM", "customers"),
      moduleCard("Estoque ideal", "Dois SKUs abaixo do mínimo e previsão de demanda acima da média.", "Abrir estoque", "stock"),
      moduleCard("Capital de giro", "Ciclo financeiro projetado em 37 dias, com pressao no caixa em D+21.", "Simular", "capital"),
    ]),
  ]);
}

function metric(m) {
  return el("article", { class: "card metric" }, [
    el("div", { class: "metric-top" }, [el("p", {}, [m.label]), el("span", { class: "delta" + (m.down ? " down" : "") }, [m.delta])]),
    el("div", { class: "metric-value" }, [m.value]),
    el("div", { class: "progress" }, [el("span", { style: `width:${m.progress}%` })]),
    el("p", { class: "mini" }, [m.help]),
  ]);
}

function chartNode() {
  return el("div", {}, [
    el("div", { class: "chart" }, chart.map(([m, r, d]) => el("div", { class: "bar" }, [
      el("i", { style: `height:${r * 2}px` }), el("b", { style: `height:${d * 2}px` }), el("label", {}, [m]),
    ]))),
    el("div", { class: "actions", style: "margin-top:12px" }, [pill("receita", "ok"), pill("despesa", "bad"), pill("p95 dashboard < 1s", "info")]),
  ]);
}

function ai() {
  return el("div", { class: "grid" }, [
    head("Assistente de IA", "Chat contextual, recomendações, simulações e plano de ação priorizado.", [btn("Gerar relatório", "▣"), btn("Nova simulação", "◇", true)]),
    el("div", { class: "ai-layout" }, [
      el("section", { class: "panel chat" }, [
        el("div", { class: "panel-head" }, [el("h2", {}, ["Copiloto financeiro"]), pill("RAG + dados da empresa", "info")]),
        el("div", { class: "messages", id: "messages" }, [
          msg("Analisei o caixa, estoque e fornecedores. A maior oportunidade está em renegociar Alpha e ajustar o estoque de CAF-001.", false),
          msg("E se eu aumentar os preços em 10% nos produtos de maior giro?", true),
          msg("Impacto estimado: +R$ 31.200 em receita mensal, risco médio de queda de 4% no volume. Próximo passo: testar aumento de 6% por 14 dias.", false),
        ]),
        el("form", { class: "composer", onsubmit: sendAi }, [
          el("input", { id: "aiInput", placeholder: "Pergunte sobre caixa, estoque, risco, vendas ou cenários..." }),
          el("button", { class: "btn primary" }, ["Enviar"]),
        ]),
      ]),
      panel("Recomendações ativas", list([
        ["Renegociar fornecedor Alpha", "Economia potencial de R$ 9.800/mês.", pill("alto impacto", "ok")],
        ["Antecipar recebíveis seletivamente", "Cobrir gap de caixa em D+21.", pill("risco médio", "warn")],
        ["Campanha Padaria Sol", "Cliente em risco de abandono.", pill("CRM", "info")],
      ])),
    ]),
  ]);
}

function capital() {
  return modulePage("Capital de giro", "Ciclo financeiro, liquidez, endividamento, projeção de caixa e recomendações de crédito.", [
    metric({ label: "Liquidez corrente", value: "1,42", delta: "+0,08", help: "ativos circulantes / passivos", progress: 71 }),
    metric({ label: "Ciclo financeiro", value: "37 dias", delta: "-4 dias", help: "PME + estoque - PMP", progress: 63 }),
    metric({ label: "Gap projetado", value: money.format(38400), delta: "D+21", down: true, help: "projeção de caixa", progress: 48 }),
    metric({ label: "Cobertura juros", value: "4,1x", delta: "saudavel", help: "EBIT / juros", progress: 82 }),
  ], [
    ["Ação sugerida", "Impacto", "Risco", "Prazo"],
    ["Antecipar 18% dos recebíveis", money.format(42100), "Médio", "7 dias"],
    ["Renegociar prazo fornecedor Beta", money.format(18500), "Baixo", "14 dias"],
    ["Reduzir estoque parado", money.format(23100), "Médio", "30 dias"],
  ]);
}

function customers() {
  return crudPage("Clientes", "CRM com histórico, ticket médio, frequência, segmentação e risco de abandono.", ["Cliente", "Segmento", "Ticket total", "Risco", "Histórico"], customerRows);
}

function suppliers() {
  return crudPage("Fornecedores", "Confiabilidade, contratos, prazos, condições comerciais e oportunidades de renegociação.", ["Fornecedor", "Categoria", "Score", "Prazo", "IA"], supplierRows);
}

function stockPage() {
  return crudPage("Estoque", "Produtos com SKU, mínimo/máximo, movimentações, alertas e previsão de demanda.", ["SKU", "Produto", "Qtd", "Mínimo", "Preço", "Status"], stock);
}

function marketplace() {
  return crudPage("Marketplace", "Pedidos e performance multi-canal: Mercado Livre, Shopee, Amazon, Shopify e WooCommerce.", ["Canal", "Pedido", "Valor", "Status", "Performance"], orders);
}

function payroll() {
  return crudPage("Folha de pagamento", "Colaboradores, salario, beneficios, encargos, comissoes e custo total da empresa.", ["Colaborador", "Area", "Bruto", "Custo empresa", "Alerta"], employees);
}

function assetsPage() {
  return crudPage("Patrimônio", "Ativos fixos, depreciação automática, manutenção preventiva e valor patrimonial atualizado.", ["Ativo", "Categoria", "Valor compra", "Valor atual", "IA"], assets);
}

function investorsPage() {
  return crudPage("Perfil do investidor", "Matching automático entre investidores e empresas compatíveis por risco, setor e retorno esperado.", ["Investidor", "Risco", "Capital", "Interesse", "Compatibilidade"], investors);
}

function reports() {
  return el("div", { class: "grid" }, [
    head("Relatórios", "PDF, Excel, relatório executivo IA e auditoria operacional.", [btn("Baixar PDF", "⇩", true), btn("Agendar envio", "◷")]),
    el("div", { class: "kanban" }, [
      lane("Prontos", ["DRE gerencial - Maio", "Fluxo de caixa 30 dias", "Estoque crítico"]),
      lane("Agendados", ["Análise semanal IA", "LGPD export mensal", "Marketplace performance"]),
      lane("Em geração", ["Relatório executivo para investidores", "Auditoria de permissões"]),
    ]),
  ]);
}

function security() {
  return el("div", { class: "grid" }, [
    head("RBAC e LGPD", "Permissões granulares, isolamento multiempresa, consentimento e auditoria imutável.", [btn("Convidar usuário", "＋", true), btn("Exportar dados", "⇩")]),
    el("div", { class: "grid cols-2" }, [
      tablePanel("Matriz de permissões", ["Role", "Acesso principal", "Permissões"], [
        ["PLATFORM_ADMIN", "Todas as empresas", "companies:*, users:*, logs:*, integrations:*"],
        ["COMPANY_OWNER", "Empresa própria", "dashboard, reports, ai, users, settings"],
        ["OPERATOR", "Operação", "customers, suppliers, products, stock, orders"],
        ["INVESTOR", "Somente leitura", "dashboard e reports autorizados"],
      ]),
      panel("Controles de conformidade", list([
        ["JWT + refresh token", "Access token de 15 minutos com rotação de refresh.", pill("auth", "info")],
        ["RLS por company_id", "Todo recurso valida o tenant antes de exibir dados.", pill("multiempresa", "ok")],
        ["Direitos LGPD", "Portabilidade, esquecimento, consentimento e finalidade.", pill("LGPD", "warn")],
      ])),
    ]),
  ]);
}

function roadmap() {
  return el("div", { class: "grid" }, [
    head("Roadmap MVP", "Execucao em fases conforme o plano tecnico aprovado em 03/06/2026.", [btn("Criar tarefa", "＋", true)]),
    el("section", { class: "panel timeline" }, [
      phase("MVP 1 - Plataforma base", "Login, empresa, clientes, fornecedores, produtos, caixa, dashboard e RBAC.", "done"),
      phase("MVP 2 - Operacional", "Estoque avançado, metas, alertas, folha, patrimônio, relatórios e notificações.", "active"),
      phase("MVP 3 - Inteligência artificial", "Chat contextual, RAG, recomendações, simulações e score financeiro.", ""),
      phase("MVP 4 - Avançado", "Econodata, marketplaces, Open Finance, investidores e PWA/mobile.", ""),
    ]),
  ]);
}

function modulePage(title, subtitle, cards, rows) {
  return el("div", { class: "grid" }, [
    head(title, subtitle, [btn("Simular", "◇", true), btn("Exportar", "⇩")]),
    el("div", { class: "grid cols-4" }, cards),
    tablePanel("Plano de ação", rows[0], rows.slice(1)),
  ]);
}

function crudPage(title, subtitle, headers, rows) {
  return el("div", { class: "grid" }, [
    head(title, subtitle, [btn("Novo registro", "＋", true, () => openDrawer(`Novo ${title.toLowerCase()}`)), btn("Importar CSV", "⇧"), btn("Exportar", "⇩")]),
    el("div", { class: "tabs" }, ["Todos", "Críticos", "IA sugeriu ação", "Arquivados"].map((x, i) => el("button", { class: "tab" + (i === 0 ? " active" : "") }, [x]))),
    tablePanel(title, headers, rows),
    el("div", { class: "grid cols-3" }, [
      moduleCard("Automação IA", "Análise diária detecta riscos, oportunidades e próximos passos concretos.", "Ver IA", "ai"),
      moduleCard("Auditoria", "Toda alteração gera registro com usuário, data, IP e company_id.", "RBAC", "security"),
      moduleCard("Relatórios", "Exporte dados em PDF e Excel com filtros do módulo.", "Abrir", "reports"),
    ]),
  ]);
}

function tablePanel(title, headers, rows) {
  return panel(title, el("div", { class: "table-wrap" }, [
    el("table", {}, [
      el("thead", {}, [el("tr", {}, headers.map((h) => el("th", {}, [h])))]),
      el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c) => el("td", { html: cell(c) }))))),
    ]),
  ]));
}

function cell(c) {
  if (typeof c !== "string") return c.outerHTML || "";
  const low = c.toLowerCase();
  if (["ok", "baixo", "concluido", "enviado"].includes(low)) return `<span class="status ok">${c}</span>`;
  if (["médio", "atencao", "atenção", "separação", "recebido"].includes(low)) return `<span class="status warn">${c}</span>`;
  if (["alto", "ruptura"].includes(low)) return `<span class="status bad">${c}</span>`;
  return c;
}

function panel(title, body, foot) {
  return el("section", { class: "panel" }, [
    el("div", { class: "panel-head" }, [el("h2", {}, [title])]),
    body?.nodeType ? body : el("div", {}, [body]),
    foot ? el("p", { class: "mini", style: "margin-top:12px" }, [foot]) : "",
  ]);
}

function list(items) {
  return el("div", { class: "list" }, items.map(([a, b, c]) => el("div", { class: "item" }, [
    el("div", {}, [el("strong", {}, [a]), el("p", {}, [b])]), c || "",
  ])));
}

function moduleCard(title, text, action, route) {
  return el("article", { class: "card" }, [
    el("h2", {}, [title]), el("p", { style: "margin:8px 0 16px" }, [text]),
    el("button", { class: "btn", onclick: () => { state.route = route; render(); } }, [action]),
  ]);
}

function lane(title, cards) {
  return el("div", { class: "lane" }, [el("h3", {}, [title]), ...cards.map((x) => el("div", { class: "item" }, [el("div", {}, [el("strong", {}, [x]), el("p", {}, ["Atualizado hoje"])]), pill("ativo", "info")]))]);
}

function phase(title, text, cls) {
  return el("div", { class: `phase ${cls}` }, [el("strong", {}, [title]), el("p", {}, [text])]);
}

function pill(text, tone) {
  return el("span", { class: `status ${tone}` }, [text]);
}

function btn(text, icon, primary, onclick) {
  return el("button", { class: "btn" + (primary ? " primary" : ""), onclick: onclick || (() => openDrawer(text)) }, [
    el("span", { class: "ico" }, [icon]),
    el("span", {}, [text]),
  ]);
}

function field(label, type, value) {
  return el("div", { class: "field" }, [el("label", {}, [label]), el("input", { type, value })]);
}

function msg(text, user) {
  return el("div", { class: "msg" + (user ? " user" : "") }, [text]);
}

function sendAi(e) {
  e.preventDefault();
  const input = document.getElementById("aiInput");
  if (!input.value.trim()) return;
  const box = document.getElementById("messages");
  box.append(msg(input.value, true));
  box.append(msg("Cenário calculado. Vou cruzar fluxo de caixa, vendas, estoque e risco operacional para sugerir uma ação priorizada.", false));
  input.value = "";
}

function drawer() {
  return el("aside", { class: "drawer" + (state.drawer ? " open" : "") }, [
    el("div", { class: "panel-head" }, [el("h2", {}, [state.drawer || "Ação"]), el("button", { class: "btn icon", onclick: () => { state.drawer = null; render(); } }, ["×"])]),
    el("div", { class: "form" }, [
      field("Nome", "text", ""),
      field("Categoria", "text", ""),
      el("div", { class: "field" }, [el("label", {}, ["Prioridade"]), el("select", {}, [el("option", {}, ["Alta"]), el("option", {}, ["Média"]), el("option", {}, ["Baixa"])])]),
      el("div", { class: "field" }, [el("label", {}, ["Observações"]), el("textarea", { placeholder: "Detalhe o registro ou ação..." })]),
      el("button", { class: "btn primary", onclick: () => { state.drawer = null; render(); } }, ["Salvar"]),
    ]),
  ]);
}

function openDrawer(title) {
  state.drawer = title;
  render();
}

function toggleMenu() {
  document.getElementById("sidebar")?.classList.toggle("open");
}

function closeMenu() {
  document.getElementById("sidebar")?.classList.remove("open");
}

function render() {
  const root = document.getElementById("app");
  root.innerHTML = "";
  root.append(app());
}

function getInitials() {
  const name = state.user?.name || state.user?.email || "NF";
  return name
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "NF";
}

function logout() {
  localStorage.removeItem("nexfinance_token");
  localStorage.removeItem("nexfinance_user");
  window.location.href = "login.html";
}

render();
