import sys
import os
import random
import math
from PySide6.QtWidgets import QApplication, QWidget, QLabel, QMenu, QVBoxLayout
from PySide6.QtGui import QPixmap, QPainter, QColor, QFont, QBrush, QPen, QPolygon
from PySide6.QtCore import Qt, QTimer, QPoint, QPropertyAnimation, QEasingCurve, QRectF
from PySide6.QtCore import Signal


def resource_path(relative_path):
    """获取资源文件的绝对路径，兼容 PyInstaller 打包"""
    if hasattr(sys, '_MEIPASS'):
        # PyInstaller 打包后的临时目录
        return os.path.join(sys._MEIPASS, relative_path)
    # 正常运行时的路径
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)


# 对话气泡内容
DIALOGUES = [
    "你好呀~",
    "今天也要加油哦！",
    "摸摸头~",
    "嘻嘻，被你发现了！",
    "我在看着你哦~",
    "要不要一起玩？",
    "咕~肚子饿了",
    "你在做什么呀？",
    "好无聊啊...",
    "我超可爱的！",
    "嘿嘿~",
    "别戳我啦！",
    "再戳我生气了！",
    "嗯？叫我吗？",
    "困了...想睡觉...",
    "你的屏幕好亮",
    "我是塔罗牌精灵！",
    "命运的齿轮开始转动~",
    "愚者之旅，永不停歇",
    "前方有新的冒险吗？",
    "跟着我走吧！",
    "未知才有趣~",
]


class BubbleWidget(QWidget):
    """对话气泡组件"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.text = ""
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.Tool | Qt.WindowStaysOnTopHint)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_ShowWithoutActivating)
        self.hide()
        self.timer = QTimer(self)
        self.timer.setSingleShot(True)
        self.timer.timeout.connect(self.hide)

    def show_text(self, text, duration=2500):
        self.text = text
        # 计算气泡大小
        font = QFont("Microsoft YaHei", 10)
        metrics = self.fontMetrics()
        text_width = metrics.horizontalAdvance(text)
        text_height = metrics.height()
        padding_x = 18
        padding_y = 12
        self.setFixedSize(text_width + padding_x * 2, text_height + padding_y * 2)
        self.update()
        self.show()
        self.timer.start(duration)

    def paintEvent(self, event):
        if not self.text:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        # 气泡背景
        rect = self.rect().adjusted(0, 0, -1, -8)
        painter.setBrush(QBrush(QColor(255, 255, 255, 240)))
        painter.setPen(QPen(QColor(200, 200, 200, 200), 1))
        painter.drawRoundedRect(rect, 12, 12)

        # 气泡小尾巴
        tail_x = self.width() * 0.3
        tail_y = self.height() - 8
        points = QPolygon([
            QPoint(tail_x - 6, tail_y),
            QPoint(tail_x + 6, tail_y),
            QPoint(tail_x, self.height())
        ])
        painter.setBrush(QBrush(QColor(255, 255, 255, 240)))
        painter.setPen(Qt.NoPen)
        painter.drawPolygon(points)

        # 文字
        painter.setPen(QColor(50, 50, 50))
        font = QFont("Microsoft YaHei", 10)
        painter.setFont(font)
        text_rect = self.rect().adjusted(18, 12, -18, -20)
        painter.drawText(text_rect, Qt.AlignCenter, self.text)


class DesktopPet(QWidget):
    """桌面宠物主窗口"""
    def __init__(self):
        super().__init__()
        self.scale = 0.35  # 默认缩放比例
        self.is_stay_on_top = True
        self.dragging = False
        self.drag_offset = QPoint()
        self.press_pos = QPoint()
        self.animation_type = 0  # 当前动画类型
        self.animations = []  # 活跃的动画列表

        # 加载图片
        img_path = resource_path("character_no_bg.png")
        self.original_pixmap = QPixmap(img_path)

        self.scaled_pixmap = self.original_pixmap.scaled(
            int(self.original_pixmap.width() * self.scale),
            int(self.original_pixmap.height() * self.scale),
            Qt.KeepAspectRatio,
            Qt.SmoothTransformation
        )

        self.init_ui()
        self.init_menu()

        # 对话气泡
        self.bubble = BubbleWidget()

        # 动画定时器
        self.anim_timer = QTimer(self)
        self.anim_timer.timeout.connect(self.update_animation)
        self.anim_frame = 0
        self.anim_total_frames = 0

    def init_ui(self):
        # 窗口设置
        self.setWindowFlags(
            Qt.FramelessWindowHint |
            Qt.WindowStaysOnTopHint |
            Qt.Tool
        )
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_ShowWithoutActivating)

        # 设置窗口大小
        self.update_size()
        self.setWindowTitle("桌宠 - 愚者")

        # 初始位置：屏幕右下角
        screen = QApplication.primaryScreen().availableGeometry()
        self.move(screen.width() - self.width() - 50, screen.height() - self.height() - 80)

    def init_menu(self):
        self.setContextMenuPolicy(Qt.CustomContextMenu)
        self.customContextMenuRequested.connect(self.show_menu)

    def show_menu(self, pos):
        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background-color: white;
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 4px;
            }
            QMenu::item {
                padding: 8px 20px;
                border-radius: 4px;
                font-family: "Microsoft YaHei";
                font-size: 10pt;
            }
            QMenu::item:selected {
                background-color: #e8f0fe;
            }
        """)

        # 调整大小子菜单
        size_menu = menu.addMenu("调整大小")
        size_small = size_menu.addAction("小")
        size_medium = size_menu.addAction("中")
        size_large = size_menu.addAction("大")
        size_xlarge = size_menu.addAction("超大")

        size_small.triggered.connect(lambda: self.set_scale(0.25))
        size_medium.triggered.connect(lambda: self.set_scale(0.35))
        size_large.triggered.connect(lambda: self.set_scale(0.5))
        size_xlarge.triggered.connect(lambda: self.set_scale(0.7))

        menu.addSeparator()

        # 置顶开关
        top_action = menu.addAction("取消置顶" if self.is_stay_on_top else "置顶")
        top_action.triggered.connect(self.toggle_stay_on_top)

        menu.addSeparator()

        # 退出
        exit_action = menu.addAction("退出")
        exit_action.triggered.connect(QApplication.instance().quit)

        menu.exec_(self.mapToGlobal(pos))

    def toggle_stay_on_top(self):
        self.is_stay_on_top = not self.is_stay_on_top
        flags = self.windowFlags()
        if self.is_stay_on_top:
            flags |= Qt.WindowStaysOnTopHint
        else:
            flags &= ~Qt.WindowStaysOnTopHint
        self.setWindowFlags(flags)
        self.show()

    def set_scale(self, scale):
        self.scale = scale
        self.scaled_pixmap = self.original_pixmap.scaled(
            int(self.original_pixmap.width() * self.scale),
            int(self.original_pixmap.height() * self.scale),
            Qt.KeepAspectRatio,
            Qt.SmoothTransformation
        )
        old_pos = self.pos()
        old_size = self.size()
        self.update_size()
        # 保持底部位置不变
        new_y = old_pos.y() + old_size.height() - self.height()
        self.move(old_pos.x(), new_y)
        self.update()

    def update_size(self):
        self.setFixedSize(self.scaled_pixmap.size())

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.SmoothPixmapTransform)

        # 应用动画变换
        painter.save()

        if self.anim_frame < self.anim_total_frames:
            progress = self.anim_frame / self.anim_total_frames
            self.apply_animation_transform(painter, progress)

        painter.drawPixmap(0, 0, self.scaled_pixmap)
        painter.restore()

    def apply_animation_transform(self, painter, progress):
        """根据动画类型应用变换"""
        w = self.width()
        h = self.height()

        if self.animation_type == 0:  # 跳跃
            # 弹跳曲线
            jump_height = 60 * self.scale
            if progress < 0.5:
                t = progress * 2
                y_offset = -jump_height * (1 - (1 - t) ** 2)
            else:
                t = (progress - 0.5) * 2
                y_offset = -jump_height * (1 - t ** 2)
            painter.translate(0, y_offset)

        elif self.animation_type == 1:  # 压扁回弹
            if progress < 0.3:
                # 压扁
                t = progress / 0.3
                scale_y = 1 - 0.25 * t
                scale_x = 1 + 0.15 * t
                painter.translate(w * (1 - scale_x) / 2, h * (1 - scale_y))
                painter.scale(scale_x, scale_y)
            elif progress < 0.6:
                # 回弹
                t = (progress - 0.3) / 0.3
                scale_y = 0.75 + 0.3 * t
                scale_x = 1.15 - 0.18 * t
                painter.translate(w * (1 - scale_x) / 2, h * (1 - scale_y))
                painter.scale(scale_x, scale_y)
            else:
                # 恢复
                t = (progress - 0.6) / 0.4
                scale_y = 1.05 - 0.05 * t
                scale_x = 0.97 + 0.03 * t
                painter.translate(w * (1 - scale_x) / 2, h * (1 - scale_y))
                painter.scale(scale_x, scale_y)

        elif self.animation_type == 2:  # 左右抖动
            shake_range = 15 * self.scale
            shake = math.sin(progress * math.pi * 6) * shake_range
            painter.translate(shake, 0)

    def update_animation(self):
        self.anim_frame += 1
        if self.anim_frame >= self.anim_total_frames:
            self.anim_timer.stop()
            self.anim_frame = 0
            self.anim_total_frames = 0
        self.update()

    def start_animation(self, anim_type):
        self.animation_type = anim_type
        self.anim_frame = 0
        if anim_type == 0:  # 跳跃
            self.anim_total_frames = 25
        elif anim_type == 1:  # 压扁回弹
            self.anim_total_frames = 30
        elif anim_type == 2:  # 左右抖动
            self.anim_total_frames = 30
        self.anim_timer.start(20)  # 50fps

    def show_bubble(self):
        text = random.choice(DIALOGUES)
        # 气泡位置：角色头部上方偏右，不遮挡角色
        bubble_x = self.x() + int(self.width() * 0.15)
        bubble_y = self.y() - 70
        self.bubble.move(bubble_x, bubble_y)
        self.bubble.show_text(text)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.dragging = True
            self.drag_offset = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            self.press_pos = event.globalPosition().toPoint()
            event.accept()

    def mouseMoveEvent(self, event):
        if self.dragging and event.buttons() & Qt.LeftButton:
            self.move(event.globalPosition().toPoint() - self.drag_offset)
            event.accept()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.dragging = False
            # 判断是否为点击（移动距离很小）
            move_distance = (event.globalPosition().toPoint() - self.press_pos).manhattanLength()
            if move_distance < 5:
                self.on_click()
            event.accept()

    def on_click(self):
        """点击触发互动"""
        # 随机选择一种动画
        anim_type = random.randint(0, 2)
        self.start_animation(anim_type)
        # 显示对话气泡
        QTimer.singleShot(200, self.show_bubble)

    def wheelEvent(self, event):
        """滚轮调整大小"""
        delta = event.angleDelta().y()
        if delta > 0:
            new_scale = min(self.scale + 0.03, 1.0)
        else:
            new_scale = max(self.scale - 0.03, 0.15)
        self.set_scale(new_scale)
        event.accept()


def main():
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    pet = DesktopPet()
    pet.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
