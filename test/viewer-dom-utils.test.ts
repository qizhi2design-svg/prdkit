import { describe, expect, it } from 'vitest';
import { findElementBySelector } from '../src/lib/viewer/src/utils/domUtils.js';

class FakeElement {
  tagName: string;
  id: string;
  className: string;
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];

  constructor(tagName: string, options: { id?: string; className?: string } = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = options.id ?? '';
    this.className = options.className ?? '';
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name: string): string | null {
    if (name === 'class') {
      return this.className || null;
    }

    if (name === 'id') {
      return this.id || null;
    }

    return null;
  }

  querySelector(): never {
    throw new SyntaxError('invalid selector');
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector !== '*') {
      throw new Error(`Unsupported selector: ${selector}`);
    }

    const nodes: FakeElement[] = [];
    for (const child of this.children) {
      nodes.push(child);
      nodes.push(...child.querySelectorAll('*'));
    }
    return nodes;
  }
}

class FakeDocument {
  documentElement: FakeElement;

  constructor(documentElement: FakeElement) {
    this.documentElement = documentElement;
  }

  querySelector(): never {
    throw new SyntaxError('invalid selector');
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.documentElement.querySelectorAll(selector);
  }
}

describe('viewer dom utils', () => {
  it('falls back to legacy selector matching for Tailwind class names with dots and colons', () => {
    const html = new FakeElement('html');
    const body = html.appendChild(new FakeElement('body', { className: 'bg-gray-50' }));
    const main = body.appendChild(new FakeElement('main', { className: 'flex-1 overflow-y-auto' }));
    const wrapper = main.appendChild(new FakeElement('div', { className: 'p-6 space-y-3' }));
    const row = wrapper.appendChild(new FakeElement('div', { className: 'flex gap-5 items-stretch' }));
    row.appendChild(new FakeElement('div', { className: 'w-72 shrink-0' }));
    const content = row.appendChild(new FakeElement('div', { className: 'flex-1 min-w-0 space-y-3' }));
    const card = content.appendChild(new FakeElement('div', { className: 'bg-white rounded-lg shadow-sm border border-gray-200' }));
    const target = card.appendChild(new FakeElement('div', {
      className: 'px-4 py-2.5 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 sm:py-3',
    }));

    const fakeDocument = new FakeDocument(html) as unknown as Document;
    const legacySelector = [
      'body.bg-gray-50:nth-child(1)',
      'main.flex-1.overflow-y-auto:nth-child(1)',
      'div.p-6.space-y-3:nth-child(1)',
      'div.flex.gap-5.items-stretch:nth-child(1)',
      'div.flex-1.min-w-0.space-y-3:nth-child(2)',
      'div.bg-white.rounded-lg.shadow-sm.border.border-gray-200:nth-child(1)',
      'div.px-4.py-2.5.border-b.border-gray-100.flex.items-center.justify-between.hover:bg-gray-50.sm:py-3:nth-child(1)',
    ].join(' > ');

    const found = findElementBySelector(fakeDocument, legacySelector);
    expect(found).toBe(target);
  });
});
