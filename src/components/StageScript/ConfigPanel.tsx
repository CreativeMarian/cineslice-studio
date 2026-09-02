import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, Modal } from '../ui';
import { ModelRecommendSelector } from '../ModelConfig/ModelRecommendSelector';
import type { ModelType } from '../../types';

interface ConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  modelType: ModelType;
  onGenerate: (params: { modelKey: string; [key: string]: unknown }) => void;
  isLoading?: boolean;
  /** 额外表单字段；支持传入函数，参数为当前选中的 modelKey，可实现字段联动 */
  extraFields?: React.ReactNode | ((modelKey: string) => React.ReactNode);
  /** 模型切换回调，可用于联动其他字段（如音色） */
  onModelChange?: (modelKey: string) => void;
  /** 预选中的模型 key（用于记忆上次选择） */
  defaultModelKey?: string;
}

export function ConfigPanel({
  open,
  onOpenChange,
  title,
  description,
  modelType,
  onGenerate,
  isLoading = false,
  extraFields,
  onModelChange,
  defaultModelKey,
}: ConfigPanelProps) {
  const [modelKey, setModelKey] = useState(defaultModelKey || '');

  // 打开面板时恢复上次选择的模型
  useEffect(() => {
    if (open && defaultModelKey && !modelKey) {
      setModelKey(defaultModelKey);
    }
  }, [open, defaultModelKey, modelKey]);

  const handleModelChange = (key: string) => {
    setModelKey(key);
    onModelChange?.(key);
  };

  const handleGenerate = () => {
    onGenerate({ modelKey });
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleGenerate} isLoading={isLoading} leftIcon={<Sparkles className="w-4 h-4" />} disabled={!modelKey}>
            开始生成
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">
            选择模型
          </label>
          <ModelRecommendSelector modelType={modelType} value={modelKey} onChange={handleModelChange} />
        </div>
        {typeof extraFields === 'function' ? extraFields(modelKey) : extraFields}
      </div>
    </Modal>
  );
}
