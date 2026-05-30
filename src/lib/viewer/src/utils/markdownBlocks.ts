import type { PrdContextBlock } from '../types/prd';

const FENCE_RE = /^(```+|~~~+)/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+\S/;
const LIST_RE = /^(\s*)([-+*]|\d+[.)])\s+/;
const BLOCKQUOTE_RE = /^>\s?/;
const TABLE_DIVIDER_RE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;

type SourceLine = {
  from: number;
  to: number;
  text: string;
};

function isBlankLine(text: string): boolean {
  return text.trim().length === 0;
}

function isIndentedContinuation(text: string): boolean {
  return /^\s{2,}\S/.test(text);
}

function isTableRow(text: string): boolean {
  return text.includes('|');
}

function toSourceLines(text: string): SourceLine[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const rawLines = normalized.split('\n');
  const lines: SourceLine[] = [];
  let offset = 0;

  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index] ?? '';
    lines.push({
      from: offset,
      to: offset + line.length,
      text: line,
    });
    offset += line.length;
    if (index < rawLines.length - 1) {
      offset += 1;
    }
  }

  return lines;
}

function buildBlock(source: string, lines: SourceLine[], startLine: number, endLine: number): PrdContextBlock {
  const start = lines[startLine - 1];
  const end = lines[endLine - 1];

  return {
    id: `${start.from}:${end.to}`,
    from: start.from,
    to: end.to,
    text: source.slice(start.from, end.to),
    startLine,
    endLine,
  };
}

export function parseMarkdownBlocksFromText(sourceText: string): PrdContextBlock[] {
  const source = sourceText.replace(/\r\n/g, '\n');
  const lines = toSourceLines(source);
  const blocks: PrdContextBlock[] = [];
  let lineNumber = 1;

  while (lineNumber <= lines.length) {
    const currentLine = lines[lineNumber - 1];
    const currentText = currentLine.text;

    if (isBlankLine(currentText)) {
      lineNumber += 1;
      continue;
    }

    const trimmed = currentText.trimStart();
    const fenceMatch = trimmed.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      let endLine = lineNumber;
      for (let probe = lineNumber + 1; probe <= lines.length; probe += 1) {
        const probeText = lines[probe - 1].text.trimStart();
        endLine = probe;
        if (probeText.startsWith(marker)) {
          break;
        }
      }
      blocks.push(buildBlock(source, lines, lineNumber, endLine));
      lineNumber = endLine + 1;
      continue;
    }

    if (HEADING_RE.test(currentText)) {
      blocks.push(buildBlock(source, lines, lineNumber, lineNumber));
      lineNumber += 1;
      continue;
    }

    if (BLOCKQUOTE_RE.test(currentText)) {
      let endLine = lineNumber;
      while (endLine + 1 <= lines.length && BLOCKQUOTE_RE.test(lines[endLine].text)) {
        endLine += 1;
      }
      blocks.push(buildBlock(source, lines, lineNumber, endLine));
      lineNumber = endLine + 1;
      continue;
    }

    if (LIST_RE.test(currentText)) {
      let endLine = lineNumber;
      while (endLine + 1 <= lines.length) {
        const nextText = lines[endLine].text;
        if (isBlankLine(nextText)) break;
        if (LIST_RE.test(nextText) || isIndentedContinuation(nextText)) {
          endLine += 1;
          continue;
        }
        break;
      }
      blocks.push(buildBlock(source, lines, lineNumber, endLine));
      lineNumber = endLine + 1;
      continue;
    }

    if (isTableRow(currentText) && lineNumber + 1 <= lines.length && TABLE_DIVIDER_RE.test(lines[lineNumber].text)) {
      let endLine = lineNumber + 1;
      while (endLine + 1 <= lines.length) {
        const nextText = lines[endLine].text;
        if (isBlankLine(nextText) || !isTableRow(nextText)) break;
        endLine += 1;
      }
      blocks.push(buildBlock(source, lines, lineNumber, endLine));
      lineNumber = endLine + 1;
      continue;
    }

    let endLine = lineNumber;
    while (endLine + 1 <= lines.length) {
      const nextText = lines[endLine].text;
      if (isBlankLine(nextText)) break;
      const nextTrimmed = nextText.trimStart();
      if (
        HEADING_RE.test(nextText)
        || BLOCKQUOTE_RE.test(nextText)
        || LIST_RE.test(nextText)
        || FENCE_RE.test(nextTrimmed)
        || (isTableRow(nextText) && endLine + 2 <= lines.length && TABLE_DIVIDER_RE.test(lines[endLine + 1].text))
      ) {
        break;
      }
      endLine += 1;
    }
    blocks.push(buildBlock(source, lines, lineNumber, endLine));
    lineNumber = endLine + 1;
  }

  return blocks;
}

export function findBlockAtPosition(blocks: PrdContextBlock[], pos: number): PrdContextBlock | null {
  return blocks.find((block) => pos >= block.from && pos <= block.to) ?? null;
}

export function toggleBlockSelection(blocks: PrdContextBlock[], target: PrdContextBlock): PrdContextBlock[] {
  const exists = blocks.some((block) => block.id === target.id);
  if (exists) {
    return blocks.filter((block) => block.id !== target.id);
  }
  return [...blocks, target];
}
