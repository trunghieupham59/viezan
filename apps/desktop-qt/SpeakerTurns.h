#pragma once
#include <QStringList>
struct SpeakerTurns {
    QString current = "Speaker 1"; int count = 1;
    double changed = 0, ended = 0; QStringList history;
    QString next(double start, double end) {
        const auto silence = qMax(0.0, start - ended);
        if (silence >= 2 && start - changed > 2.5) {
            const auto previous = current;
            if (count == 1) { count = 2; current = "Speaker 2"; }
            else if (count == 2) {
                if (silence >= 4 && history.size() >= 4) { count = 3; current = "Speaker 3"; }
                else current = previous == "Speaker 1" ? "Speaker 2" : "Speaker 1";
            } else if (count < 6) {
                QString other; for (auto i = history.crbegin(); i != history.crend(); ++i) if (*i != previous) { other = *i; break; }
                if (silence >= 4 || other.isEmpty()) current = "Speaker " + QString::number(++count); else current = other;
            } else {
                QStringList recent; for (auto i = history.crbegin(); i != history.crend(); ++i) if (!recent.contains(*i)) recent.append(*i);
                current.clear(); for (int i = 1; i <= 6; ++i) { const auto label = "Speaker " + QString::number(i); if (!recent.contains(label)) { current = label; break; } }
                if (current.isEmpty()) current = recent.isEmpty() ? "Speaker 1" : recent.last();
            }
            if (current != previous) changed = start;
        }
        ended = end; history.append(current); while (history.size() > 10) history.removeFirst(); return current;
    }
};
