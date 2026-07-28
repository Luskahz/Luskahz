export const MODE_CONFIG = {
  "bug-hunt": {
    label: "BUG HUNT / JAVA",
    size: 4,
  },
  "output-quest": {
    label: "OUTPUT QUEST / JAVASCRIPT",
    size: 4,
  },
  "sql-arena": {
    label: "SQL ARENA / MYSQL",
    size: 4,
  },
  mixed: {
    label: "MIXED RUN / FULL STACK",
    size: 6,
  },
};

export const CHALLENGES = [
  {
    id: "java-list-of",
    mode: "bug-hunt",
    title: "Coleção imutável",
    prompt: "O que acontece na última linha?",
    code: `var ids = List.of(10, 20, 30);
ids.add(40);`,
    choices: [
      "A lista passa a ter quatro itens",
      "O código não compila",
      "É lançada UnsupportedOperationException",
      "O método retorna uma nova lista",
    ],
    answer: 2,
    explanation:
      "List.of cria uma lista não modificável. O código compila, mas qualquer operação estrutural como add ou remove lança UnsupportedOperationException.",
  },
  {
    id: "java-string-equality",
    mode: "bug-hunt",
    title: "Igualdade de String",
    prompt: "Qual é o erro lógico dessa validação?",
    code: `String role = request.getRole();
if (role == "ADMIN") {
    grantAccess();
}`,
    choices: [
      "String não pode ser usada em if",
      "== compara referências, não o conteúdo",
      "ADMIN precisa ser uma constante enum",
      "grantAccess precisa retornar boolean",
    ],
    answer: 1,
    explanation:
      'Para comparar conteúdo de String use "ADMIN".equals(role). O operador == verifica se as referências apontam para o mesmo objeto.',
  },
  {
    id: "java-concurrent-modification",
    mode: "bug-hunt",
    title: "Remoção durante iteração",
    prompt: "Qual falha essa implementação pode produzir?",
    code: `for (Order order : orders) {
    if (order.isCancelled()) {
        orders.remove(order);
    }
}`,
    choices: [
      "StackOverflowError",
      "ClassCastException",
      "ConcurrentModificationException",
      "O(n²), mas nenhuma exceção",
    ],
    answer: 2,
    explanation:
      "Uma coleção não deve ser alterada diretamente durante o for-each. Use Iterator.remove ou removeIf para manter o iterador consistente.",
  },
  {
    id: "java-lazy-loading",
    mode: "bug-hunt",
    title: "Entidade fora da transação",
    prompt: "A sessão já foi encerrada. Qual é a causa provável da falha?",
    code: `Order order = service.findById(id);
return order.getItems().size(); // items = LAZY`,
    choices: [
      "Deadlock no banco",
      "LazyInitializationException",
      "Erro de serialização do JWT",
      "ConstraintViolationException",
    ],
    answer: 1,
    explanation:
      "Uma associação LAZY precisa ser carregada dentro do contexto de persistência. A correção depende do caso: fetch join, projeção ou limite transacional adequado.",
  },
  {
    id: "js-microtask-order",
    mode: "output-quest",
    title: "Event loop",
    prompt: "Qual é a ordem exibida no console?",
    code: `console.log("A");
Promise.resolve().then(() => console.log("B"));
console.log("C");`,
    choices: ["A, B, C", "A, C, B", "B, A, C", "C, B, A"],
    answer: 1,
    explanation:
      "O código síncrono termina primeiro: A e C. O callback da Promise entra na fila de microtasks e executa depois, imprimindo B.",
  },
  {
    id: "js-map-parse-int",
    mode: "output-quest",
    title: "Callback com argumento extra",
    prompt: "Qual é o resultado?",
    code: `["1", "2", "3"].map(parseInt);`,
    choices: [
      "[1, 2, 3]",
      "[1, NaN, NaN]",
      '["1", "2", "3"]',
      "TypeError",
    ],
    answer: 1,
    explanation:
      "map passa valor e índice. parseInt recebe o índice como radix: parseInt('2', 1) e parseInt('3', 2) resultam em NaN.",
  },
  {
    id: "js-var-loop",
    mode: "output-quest",
    title: "Closure e var",
    prompt: "Depois de um segundo, o que será exibido?",
    code: `for (var i = 0; i < 3; i++) {
    setTimeout(() => console.log(i), 1000);
}`,
    choices: ["0, 1, 2", "3, 3, 3", "0, 0, 0", "Nada"],
    answer: 1,
    explanation:
      "var possui escopo de função e todos os callbacks enxergam o mesmo i, que já vale 3. Com let, cada iteração teria seu próprio binding.",
  },
  {
    id: "js-reference-copy",
    mode: "output-quest",
    title: "Cópia por referência",
    prompt: "Qual valor aparece no console?",
    code: `const original = { status: "OPEN" };
const copy = original;
copy.status = "DONE";
console.log(original.status);`,
    choices: ['"OPEN"', '"DONE"', "undefined", "TypeError"],
    answer: 1,
    explanation:
      "As duas variáveis guardam referência para o mesmo objeto. Alterar copy também altera o objeto observado por original.",
  },
  {
    id: "sql-having",
    mode: "sql-arena",
    title: "Clientes com mais de cinco pedidos",
    prompt: "Qual consulta aplica corretamente o filtro sobre a agregação?",
    code: `-- tabela: orders(id, customer_id, created_at)`,
    choices: [
      "SELECT customer_id, COUNT(*) FROM orders WHERE COUNT(*) > 5 GROUP BY customer_id",
      "SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 5",
      "SELECT DISTINCT customer_id FROM orders WHERE id > 5",
      "SELECT customer_id FROM orders HAVING id > 5",
    ],
    answer: 1,
    explanation:
      "WHERE filtra linhas antes do agrupamento. HAVING filtra o resultado agregado produzido pelo GROUP BY.",
  },
  {
    id: "sql-left-join-filter",
    mode: "sql-arena",
    title: "LEFT JOIN que virou INNER",
    prompt: "Por que clientes sem pedidos desaparecem?",
    code: `SELECT c.id, o.id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'OPEN';`,
    choices: [
      "LEFT JOIN não aceita WHERE",
      "O filtro rejeita as linhas em que o.status é NULL",
      "customer_id deveria estar no WHERE",
      "A consulta precisa de DISTINCT",
    ],
    answer: 1,
    explanation:
      "Nas linhas sem correspondência, o.status é NULL e falha no WHERE. Coloque o.status = 'OPEN' na condição ON para preservar todos os clientes.",
  },
  {
    id: "sql-count-column",
    mode: "sql-arena",
    title: "COUNT e valores nulos",
    prompt: "Qual afirmação é correta?",
    code: `SELECT
  COUNT(*) AS rows_total,
  COUNT(delivered_at) AS delivered_total
FROM orders;`,
    choices: [
      "Os dois counts sempre são iguais",
      "COUNT(*) ignora NULL",
      "COUNT(delivered_at) ignora valores NULL",
      "COUNT(delivered_at) conta datas distintas",
    ],
    answer: 2,
    explanation:
      "COUNT(*) conta linhas. COUNT(coluna) conta somente linhas em que a coluna não é NULL. Para valores distintos seria necessário COUNT(DISTINCT coluna).",
  },
  {
    id: "sql-row-number",
    mode: "sql-arena",
    title: "Último pedido de cada cliente",
    prompt: "Qual recurso resolve esse problema sem perder as demais colunas do pedido?",
    code: `-- retornar uma linha: o pedido mais recente
-- de cada customer_id`,
    choices: [
      "ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC)",
      "DISTINCT customer_id, *",
      "GROUP BY created_at",
      "ORDER BY customer_id LIMIT 1",
    ],
    answer: 0,
    explanation:
      "ROW_NUMBER numera os pedidos dentro de cada cliente. Depois, uma consulta externa filtra rn = 1 e preserva todas as colunas da linha escolhida.",
  },
];

function shuffle(items, random) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }

  return result;
}

export function buildRound(mode, random = Math.random) {
  const config = MODE_CONFIG[mode];
  if (!config) {
    throw new Error(`Modo desconhecido: ${mode}`);
  }

  const pool =
    mode === "mixed"
      ? CHALLENGES
      : CHALLENGES.filter((challenge) => challenge.mode === mode);

  return shuffle(pool, random).slice(0, config.size);
}

export function calculateScore({ correct, remainingSeconds, streak }) {
  if (!correct) {
    return 0;
  }

  return 100 + Math.max(remainingSeconds, 0) * 5 + Math.max(streak - 1, 0) * 25;
}
