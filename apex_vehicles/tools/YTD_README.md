# Exportar em .ytd (sem OpenIV / CodeWalker) — qualquer sistema

O estúdio gera **`.ytd` reais**, de forma segura, sem ferramentas externas nem login.
Funciona em **Windows, Linux e macOS**, incluindo **servidores headless (sem ambiente
gráfico)** — a conversão é uma linha de comando (CLI), não precisa de janelas.

## Como funciona (porque é seguro)

Não cria o `.ytd` do zero (o formato binário RSC7 crasha o jogo ao mínimo erro).
Em vez disso, pega no **`.ytd` original** da mesma roupa (que já está em `stream/`) e
**troca apenas os pixels da textura** — mesmo formato, dimensões e nº de mipmaps — e
recomprime. Tudo o resto fica byte-idêntico a um ficheiro que o jogo já carrega.

## Passos

1. No estúdio: **Export** → **"Real .ytd texture"** → Run.
   (Grava o PNG em `tools/ytd_in/<nome>.png`.)
2. Corre o conversor — escolhe o método do teu sistema:

   **Windows (com ecrã):** duplo-clique em `tools\make_ytd.bat`

   **Linux / macOS:** `bash tools/make_ytd.sh`
   (ou `chmod +x tools/make_ytd.sh` uma vez e depois `./tools/make_ytd.sh`)

   **Qualquer sistema / headless / SSH:** dentro da pasta `tools/`:
   ```
   node make_ytd.js --auto
   ```
   (A consola do servidor imprime este comando exato, com o caminho já preenchido,
   sempre que exportas — é só copiar e colar.)

3. O `.ytd` pronto aparece em `tools/ytd_out/`.
4. Mete o `.ytd` na tua stream (substitui o original) e reinicia o recurso.

## Requisito único

- **Node.js** instalado na máquina onde corres o comando.
  - Windows: https://nodejs.org
  - Linux: `apt install nodejs` / `nvm install --lts` / etc.
  - (É o mesmo Node que o `convert.js` já usa.)

## Uso manual (um ficheiro só)

```
node make_ytd.js <design.png> <template.ytd> <out.ytd>
```
`<template.ytd>` = o `.ytd` original da roupa (usado como molde).
