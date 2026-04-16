import { Timeline, Empty, Tag } from 'antd';
import type { CustomerInteraction, InteractionChannel } from '../types/customer';

const CHANNEL_LABEL: Record<InteractionChannel, string> = {
  phone: '电话',
  wechat: '微信',
  visit: '到店',
  other: '其他',
};

function formatDate(s: string) {
  return new Date(s).toLocaleString('zh-CN');
}

export default function InteractionTimeline({
  items,
}: {
  items: CustomerInteraction[];
}) {
  if (!items.length) return <Empty description="暂无跟进" />;
  return (
    <Timeline
      items={items.map((item) => ({
        children: (
          <div>
            <div>
              <Tag>{CHANNEL_LABEL[item.channel] || item.channel}</Tag>
              <span style={{ color: '#888', fontSize: 12 }}>
                {formatDate(item.created_at)}
              </span>
              {item.intent_level_after != null && (
                <Tag color="blue" style={{ marginLeft: 8 }}>
                  意向度 {item.intent_level_after}
                </Tag>
              )}
            </div>
            <div style={{ marginTop: 4 }}>{item.content}</div>
          </div>
        ),
      }))}
    />
  );
}
