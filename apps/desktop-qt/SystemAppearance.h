#pragma once
#include <QObject>
#include <QFuture>
#include <functional>

class SystemAppearance final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool reduceTransparency READ reduceTransparency NOTIFY reduceTransparencyChanged)
    Q_PROPERTY(bool highContrast READ highContrast NOTIFY highContrastChanged)
public:
    struct State { bool reduceTransparency = false; bool highContrast = false; };
    using Reader = std::function<State()>;
    explicit SystemAppearance(QObject *parent = nullptr);
    explicit SystemAppearance(Reader reader, QObject *parent = nullptr);
    ~SystemAppearance() override;
    bool reduceTransparency() const { return m_state.reduceTransparency; }
    bool highContrast() const { return m_state.highContrast; }
    Q_INVOKABLE void refresh();
signals:
    void reduceTransparencyChanged();
    void highContrastChanged();
protected:
    bool eventFilter(QObject *object, QEvent *event) override;
private:
    Reader m_reader;
    State m_state;
    QFuture<State> m_future;
    bool m_busy = false;
    bool m_pending = false;
};
