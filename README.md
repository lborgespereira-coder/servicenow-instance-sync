# Integração entre Instâncias ServiceNow — Espelhamento de Incidents em Tempo Real

Integração server-to-server entre duas instâncias ServiceNow distintas, que espelha a criação e atualização de incidentes em tempo real usando a **Table API** nativa da plataforma. Projeto desenvolvido em dupla, simulando um cenário real de integração entre empresas/instâncias diferentes.

## Como funciona

```
Incidente criado/atualizado (Instância A)
            │
            ▼
     Business Rule (before/after insert/update)
            │
            ▼
     Script Include (ApiAmigo.enviar)
            │
            ▼
  RESTMessageV2 → Table API (Instância B)
            │
            ▼
   POST (1ª vez) ou PUT (atualizações)
            │
            ▼
  sys_id remoto salvo no incidente local
  (referência para futuras atualizações)
```

1. Um incidente é criado ou atualizado na **Instância A**.
2. Uma **Business Rule** dispara automaticamente e chama o Script Include `ApiAmigo`.
3. O Script Include verifica se esse incidente já foi enviado antes (via campo customizado `u_sys_id_remoto`):
   - **Não foi enviado** → faz **POST** na Table API da Instância B, criando um novo incidente.
   - **Já foi enviado** → faz **PUT** no mesmo endpoint, atualizando o incidente existente na Instância B.
4. Se houver comentário ou work note novo, ele é identificado e incluído no payload.
5. Na primeira criação, o `sys_id` do incidente remoto retornado pela API é salvo no campo `u_sys_id_remoto` do incidente local — essa referência é o que permite que atualizações futuras apontem para o registro certo.

## Arquivos

- `business-rule.js` — dispara a integração a cada criação/atualização de incidente.
- `script-include.js` — monta e executa a chamada REST para a instância remota (Table API).

## Tecnologias e conceitos aplicados

- **Table API** (`/api/now/table/incident`) — criação e atualização de registros via REST nativo do ServiceNow.
- **RESTMessageV2** — chamadas REST outbound com autenticação Basic Auth.
- **sys_journal_field** — consulta direta à tabela de journal para recuperar a entrada mais recente de campos do tipo *journal* (`comments`, `work_notes`), evitando reenvio do histórico completo.
- **Idempotência via referência remota** — uso de um campo customizado (`u_sys_id_remoto`) para decidir entre criar ou atualizar, evitando duplicação de registros a cada sincronização.
- **`setWorkflow(false)`** — controle de execução para evitar loop de disparo de Business Rules ao persistir o `sys_id` remoto de volta no próprio registro.

## Aprendizados e debug real

Durante a revisão do código para este repositório, identifiquei um comportamento que reforça a importância de validar suposições em vez de confiar apenas na aparência do código funcionando:

O Business Rule tinha originalmente uma condição de saída baseada em um campo `u_integrado`:

```javascript
if (current.u_integrado == true) {
    return;
}
```

A integração funcionava corretamente em todos os testes (criação e atualização eram espelhadas normalmente), o que sugeria que a lógica estava correta. Investigando com logs (`gs.info` e `getValue`), descobri que **o campo `u_integrado` nunca existiu na tabela `incident`** — ele havia sido planejado, mas nunca criado no Dictionary. Isso fazia com que:

- `current.u_integrado` retornasse `undefined`
- A comparação `undefined == true` fosse sempre `false`
- O `return` nunca fosse executado
- O Script Include rodasse em **toda** execução da Business Rule, sem exceção

A integração funcionava, mas não pelo motivo que o código sugeria: quem realmente controlava criação vs. atualização era o campo `u_sys_id_remoto`, que decide entre POST e PUT no Script Include. A referência a `u_integrado` era, na prática, código morto.

**Decisão tomada:** removi as referências ao campo inexistente (na Business Rule e no Script Include), simplificando o fluxo para refletir o que de fato funciona — a lógica de POST/PUT baseada em `u_sys_id_remoto`.

## Melhorias identificadas (próximos passos)

- **Credenciais**: a versão de desenvolvimento usava usuário e senha diretamente no código (`setBasicAuth`). A forma correta seria usar um **Connection & Credential Alias**, evitando qualquer credencial em texto puro no script.
- **Validação de payload**: campos como `short_description`, `state`, `impact` e `urgency` são convertidos com `.toString()` sem checagem de nulo — se algum vier vazio, pode gerar erro. Outros campos do mesmo payload (`contact_type`, `business_service`) já têm essa proteção; vale padronizar em todos.
- **Retorno de status**: o método `enviar()` não devolve nenhum valor para quem o chamou — sucesso ou falha ficam só registrados em log (`gs.error`), sem visibilidade para o fluxo que disparou a integração.
- **Otimização de disparo**: hoje a Business Rule envia a integração em toda alteração do incidente, mesmo mudanças irrelevantes. Uma versão futura poderia checar `changes()` em campos específicos antes de disparar a chamada REST, reduzindo tráfego desnecessário.

## Autores

Projeto desenvolvido por Lucas Borges, como prática de integração real entre instâncias ServiceNow, durante transição de carreira de Logística para Tecnologia.
