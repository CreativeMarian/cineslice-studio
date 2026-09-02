import { describe, it, expect } from 'vitest';
import { parseAiJson, parseAiJsonOrThrow } from '../../server/src/utils/aiJsonParser';

describe('aiJsonParser', () => {
  describe('parseAiJson - 直接 JSON', () => {
    it('解析标准 JSON 对象', () => {
      const result = parseAiJson<{ name: string }>('{"name":"测试","count":42}');
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('测试');
      expect(result.data?.count).toBe(42);
    });

    it('解析 JSON 数组', () => {
      const result = parseAiJson<string[]>('["a","b","c"]');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.data?.[0]).toBe('a');
    });

    it('解析带空白和换行的 JSON', () => {
      const result = parseAiJson('  {\n  "key": "value"\n}  ');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });
  });

  describe('parseAiJson - markdown 代码块', () => {
    it('提取 ```json 代码块中的 JSON', () => {
      const raw = '这是 AI 的回答：\n```json\n{"title":"测试","episodes":3}\n```\n希望对你有帮助';
      const result = parseAiJson<{ title: string }>(raw);
      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('测试');
      expect(result.data?.episodes).toBe(3);
    });

    it('提取无语言标记的 ``` 代码块', () => {
      const raw = '```\n{"name":"无标记"}\n```';
      const result = parseAiJson<{ name: string }>(raw);
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('无标记');
    });
  });

  describe('parseAiJson - 额外文字包裹（花括号提取）', () => {
    it('从前后文字中提取 JSON 对象', () => {
      const raw = '好的，这是结果：{"shotNumber":1,"action":"开门"} 以上就是分镜';
      const result = parseAiJson<{ shotNumber: number }>(raw);
      expect(result.success).toBe(true);
      expect(result.data?.shotNumber).toBe(1);
    });

    it('提取嵌套 JSON 对象', () => {
      const raw = '结果如下：{"outer":{"inner":"value"},"arr":[1,2]} 完毕';
      const result = parseAiJson(raw);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ outer: { inner: 'value' }, arr: [1, 2] });
    });
  });

  describe('parseAiJson - 数组提取（方括号）', () => {
    it('从文字中提取 JSON 数组', () => {
      const raw = '角色列表：[{"name":"张三"},{"name":"李四"}] 共2人';
      const result = parseAiJson<Array<{ name: string }>>(raw);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('parseAiJson - 格式修复', () => {
    it('修复 trailing comma（,} 或 ,]）', () => {
      const raw = '{"a":1,"b":2,}';
      const result = parseAiJson(raw);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ a: 1, b: 2 });
    });

    it('修复单引号为双引号', () => {
      const raw = "{'name':'测试'}";
      const result = parseAiJson(raw);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: '测试' });
    });

    it('修复未加引号的键名', () => {
      const raw = '{name:"测试",count:42}';
      const result = parseAiJson(raw);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: '测试', count: 42 });
    });
  });

  describe('parseAiJson - 失败场景', () => {
    it('空字符串返回失败', () => {
      const result = parseAiJson('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('为空');
    });

    it('非字符串输入返回失败', () => {
      const result = parseAiJson(null as any);
      expect(result.success).toBe(false);
    });

    it('完全无 JSON 内容返回失败', () => {
      const result = parseAiJson('这是一段纯文字，没有任何 JSON 内容');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('返回内容包含 rawPreview', () => {
      const result = parseAiJson('纯文字');
      expect(result.success).toBe(false);
      expect(result.rawPreview).toBeDefined();
    });
  });

  describe('parseAiJsonOrThrow', () => {
    it('解析成功返回数据', () => {
      const data = parseAiJsonOrThrow<{ ok: boolean }>('{"ok":true}');
      expect(data.ok).toBe(true);
    });

    it('解析失败抛出 AI_JSON_PARSE_ERROR', () => {
      try {
        parseAiJsonOrThrow('无效内容');
        expect.fail('应该抛出错误');
      } catch (err: any) {
        expect(err.name).toBe('AI_JSON_PARSE_ERROR');
      }
    });

    it('抛出的错误包含返回内容预览', () => {
      try {
        parseAiJsonOrThrow('完全无效的内容');
        expect.fail('应该抛出错误');
      } catch (err: any) {
        expect(err.message).toContain('返回内容预览');
        expect(err.name).toBe('AI_JSON_PARSE_ERROR');
      }
    });

    it('能解析 markdown 包裹的 JSON（不抛出）', () => {
      const raw = '```json\n{"valid":true}\n```';
      const data = parseAiJsonOrThrow<{ valid: boolean }>(raw);
      expect(data.valid).toBe(true);
    });
  });
});
