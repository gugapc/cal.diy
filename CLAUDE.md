# CLAUDE.md

## Horário comercial e fusos

Decisões de projeto definidas pelo mantenedor. Valem para regras de negócio,
defaults e código novo neste repositório.

### Fuso de referência

- **Não existe fuso "da casa".** O projeto não privilegia nenhum fuso local:
  toda regra é escrita em termos do fuso do usuário, nunca de um padrão fixo.
- **Resolução do fuso:** `timeZone` salvo no perfil tem precedência. Se ausente,
  cair para o detectado no navegador
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
- **Fallback:** se a detecção falhar ou o valor for inválido, usar **UTC**.
  Nunca chutar um fuso local — é preferível o neutro e previsível.

### Janela de horário comercial

- **Seg–Sex, 08:00–18:00**, no fuso do usuário.
- Sem bloqueio de almoço embutido: quem quiser, cria o bloqueio na própria
  disponibilidade.

### DST e conversões

- **Sempre nomes IANA** (`America/Sao_Paulo`, `Europe/Lisbon`, …).
  Nunca offsets fixos (`-03:00`) em armazenamento, config ou comparação.
- Toda conversão passa pela biblioteca de fuso (dayjs/timezone ou Temporal).
  DST é responsabilidade da lib — não implementar aritmética de offset à mão.

### Feriados e exceções

- **Sem calendário automático de feriados.** Nada é bloqueado por padrão.
- Exceções são datas manuais (date overrides) definidas pelo próprio usuário.

### Exibição na UI

- **Formato de hora derivado do locale** (12h ou 24h conforme o locale
  detectado). Não fixar um formato rígido no código.
- **Converter tudo para o fuso local de quem está olhando.** Não exibir o fuso
  do outro lado (organizador x convidado) em paralelo.

## Testes e verificação

Vale para qualquer mudança que acrescente ou altere comportamento visível na interface.

- Teste a regra e a renderização. Além do teste da função, escreva um teste do componente que
  exibe o resultado, cobrindo que ele aparece quando deve e não aparece quando não deve.
- Antes de entregar, rode `yarn test` escopado nos arquivos alterados e `yarn type-check`.
  Informe quais comandos rodaram e o resultado de cada um. Verificação que não pôde ser
  executada deve ser relatada como tal, nunca omitida.
