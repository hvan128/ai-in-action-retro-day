import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const NOTE_COLORS = ["yellow", "pink", "blue", "green", "purple", "orange"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const noteBg: Record<NoteColor, string> = {
  yellow: "bg-note-yellow",
  pink: "bg-note-pink",
  blue: "bg-note-blue",
  green: "bg-note-green",
  purple: "bg-note-purple",
  orange: "bg-note-orange",
};

export type TemplateKey = "sprint_retrospective";

export interface TemplateColumn { key: string; title: string; color: string; emoji: string; placeholder: string; prompts: string[]; }

export const TEMPLATES: Record<TemplateKey, { name: string; columns: TemplateColumn[] }> = {
  sprint_retrospective: {
    name: "Nhìn lại hành trình 14 ngày",
    columns: [
      {
        key: "went_well",
        title: "Điều gì chúng ta đã làm tốt",
        color: "sky",
        emoji: "😊",
        placeholder: "Điều gì chúng ta đã làm tốt?",
        prompts: [
          "Thành tựu nào trong hành trình 14 ngày khiến bạn tự hào nhất?",
          "Phương pháp học / công cụ nào đã giúp bạn hiểu bài và làm việc hiệu quả hơn?",
          "Khoảnh khắc nào trong chương trình khiến bạn thấy vui / được tiếp thêm năng lượng?",
          "Ai trong nhóm xứng đáng được cảm ơn / khen ngợi và vì điều gì?",
          "Thói quen tốt nào mình muốn duy trì cho các khoá học hoặc dự án sắp tới?",
        ],
      },
      {
        key: "could_be_better",
        title: "Điều gì chúng ta/chương trình chưa làm tốt?",
        color: "rose",
        emoji: "😟",
        placeholder: "Điều gì chúng ta/chương trình chưa làm tốt?",
        prompts: [
          "Bạn cảm thấy kỹ năng hoặc thói quen nào của bản thân cần cải thiện sau hành trình này?",
          "Khâu nào trong cách làm việc nhóm của bạn còn chưa thực sự hiệu quả?",
          "Có điều gì về chương trình hoặc cách tổ chức bạn muốn góp ý nhưng chưa có cơ hội chia sẻ?",
          "Bạn đã bỏ lỡ cơ hội hoặc mắc sai lầm gì trong hành trình vừa qua mà muốn rút kinh nghiệm?",
          "Nếu được tham gia lại hành trình này, bạn sẽ thay đổi điều gì đầu tiên?",
        ],
      },
      {
        key: "do_differently",
        title: "Có những ý tưởng nào chúng ta muốn triển khai sắp tới?",
        color: "emerald",
        emoji: "💡",
        placeholder: "Có những ý tưởng nào chúng ta muốn triển khai sắp tới?",
        prompts: [
          "Bạn muốn thử nghiệm phương pháp học hoặc làm việc mới nào?",
          "Có công cụ / quy trình / nguồn tài liệu nào bạn thấy nên áp dụng cho chương trình?",
          "Một thay đổi nhỏ nào trong cách dạy, học hoặc tổ chức có thể tạo ra khác biệt lớn?",
          "Ý tưởng nào bạn ấp ủ đã lâu nhưng chưa dám đề xuất cho khoá học hoặc nhóm?",
          "Nhóm / chương trình có thể học hỏi gì từ khoá học hoặc cộng đồng khác?",
        ],
      },
      {
        key: "action_items",
        title: "Những điều chúng ta còn trăn trở",
        color: "amber",
        emoji: "🤔",
        placeholder: "Những điều chúng ta còn trăn trở…",
        prompts: [
          "Điều gì khiến bạn còn lăn tăn về hướng đi của nhóm hoặc chương trình?",
          "Rủi ro nào trong quá trình học hoặc triển khai bạn lo lắng nhưng chưa biết xử lý thế nào?",
          "Câu hỏi nào bạn muốn cả nhóm cùng thảo luận sâu hơn sau khoá học?",
          "Có quyết định nào liên quan đến dự án hoặc học tập bạn vẫn cảm thấy chưa rõ ràng?",
          "Điều gì đang cản trở bạn phát huy hết khả năng trong hành trình này?",
        ],
      },
    ],
  },
};
