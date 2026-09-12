# Sudoku

Uma plataforma pessoal de Sudoku clássico: crie rascunhos, finalize jogos e continue seu progresso neste navegador.

## Executar no seu PC

Requisitos verificados: **Node.js 24.19.0 e npm 11.17.0**. O aplicativo usa TypeScript, Vite e IndexedDB; Java não é necessário.

No PowerShell, a partir deste repositório:

```powershell
cd web
npm ci
npm run dev
```

Abra exatamente **http://localhost:5173**. Mantenha o terminal aberto; `Ctrl+C` encerra o servidor. A porta é fixa: se estiver ocupada, o Vite informa o erro em vez de mudar de endereço.

Os dados pertencem ao navegador, perfil e endereço usados. Outro navegador, `127.0.0.1` ou outra porta terá uma biblioteca separada. O aplicativo não sincroniza dados entre dispositivos.

## Criar e jogar

- **Criar** abre um rascunho salvo automaticamente, inclusive com conflitos. **Colar puzzle** aceita 81 células: `1–9` como pistas, `0` ou `.` como vazias; espaços e quebras de linha são ignorados. A importação cria outro rascunho.
- **Finalizar** exige ausência de conflitos visíveis e cria um jogo com pistas fixas. Isso não verifica existência de solução nem unicidade. É permitido finalizar um tabuleiro vazio.
- A **Biblioteca** permite abrir, continuar, renomear, editar uma cópia e excluir com confirmação. Cada jogo tem uma sessão atual; a cópia não altera seu progresso original.
- Em **Configurações**, ative o destaque opcional de conflitos durante o jogo. A criação sempre destaca conflitos.

| Controle | Ação |
| --- | --- |
| Clique / setas | Selecionar; setas atravessam a borda para o lado oposto da mesma linha/coluna. |
| `1–9` / teclado numérico / botões | Inserir um número. Pistas fixas são selecionáveis, mas não editáveis. |
| `Shift` + número ou botão | Nota de canto temporária durante o jogo. |
| **Notas** | Ativar/desativar a ferramenta persistente de notas. |
| `0`, `Delete`, `Backspace` / **Apagar** | Apagar o valor e revelar notas guardadas; se vazio, apagar as notas. |
| `Ctrl+Z` / **Desfazer** | Desfazer a última edição. Seleção e navegação não entram no histórico. |
| `Ctrl+Y`, `Ctrl+Shift+Z` / **Refazer** | Refazer uma edição desfeita. |
| **Reiniciar** | Limpar valores e notas editáveis em uma ação que pode ser desfeita. |

As notas são manuais e não são removidas automaticamente das células vizinhas. Valores ocultam notas sem apagá-las. Os históricos separados de rascunho e jogo sobrevivem à reabertura.

## Salvar e recuperar

**Salvo** significa que a transação local terminou. Se aparecer **Não salvo**, seu trabalho continua na memória: use **Exportar trabalho** e/ou **Tentar salvar novamente**. Se outra aba salvou uma versão mais nova, exporte o trabalho da aba em conflito antes de recarregá-la; depois importe o backup para preservar ambas as versões.

Em **Configurações → Exportar backup**, baixe um JSON com a biblioteca completa, notas, históricos e configurações. **Importar backup** valida o arquivo inteiro e mostra um resumo antes de aplicar. Registros idênticos são ignorados; conflitos são importados como cópias com seus vínculos preservados. As configurações atuais são mantidas, a menos que você marque a opção de restaurá-las. Uma exclusão confirmada é recuperável somente por um backup anterior.

Mantenha backups dos jogos que deseja guardar. Limpar dados do navegador ou perder seu perfil pode apagar o armazenamento local; não há servidor de recuperação. Os testes de falha simulam erros do adaptador, sem prometer comportamento de quotas ou remoção automática pelo navegador.

## Verificar a implementação

Execute em `web/`:

```powershell
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Os testes de navegador usam **http://127.0.0.1:5174**, perfis isolados e arquivos em `web/test-results/`; não usam a biblioteca pessoal de `localhost:5173`. O teste de reinício relança Chromium com um perfil temporário próprio. Capturas de tela e rastros de falhas ficam no diretório de resultados, ignorado pelo Git.

O build de produção é gerado em `web/dist/`. Não há dependências de interface ou armazenamento em runtime, chamadas a serviços de validação, nem fontes externas.

## Escopo e continuidade

Esta versão inclui criação e jogo clássicos, biblioteca pessoal, configurações e backup. Solver, dicas, variantes, comunidade e IA pertencem às próximas etapas; **Resolver** e **Explorar** estão identificados como futuros recursos.

Os arquivos Spring/Java em `src/`, `pom.xml` e os wrappers Maven foram preservados como referência legada. O runtime ativo está em `web/`.

Consulte [o estado e os resultados da implementação](docs/README.md), [a especificação aprovada](docs/superpowers/specs/2026-09-12-first-release-design.md) e [o roteiro das próximas etapas](docs/roadmap.md).
