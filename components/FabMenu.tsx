import { Animated, Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { styles } from "../styles/home";
import { COLORS } from "../utils/constants";

interface MenuItem {
  icon: string;
  label: string;
  action: () => void;
  description?: string;
}

interface FabMenuProps {
  menuItems: MenuItem[];
  menuAnimation: Animated.Value;
  fabAnimation: Animated.Value;
  toggleMenu: () => void;
}

const getMenuItemColor = (icon: string) => {
  switch (icon) {
    case "map-marker-radius":
      return COLORS.SECONDARY;
    case "crosshairs-gps":
      return COLORS.PRIMARY;
    case "map-marker":
      return COLORS.WARNING;
    default:
      return COLORS.TEXT_SECONDARY;
  }
};

export default function FabMenu({
  menuItems,
  menuAnimation,
  fabAnimation,
  toggleMenu,
}: FabMenuProps) {
  return (
    <View style={styles.fabContainer}>
      {menuItems.map((item, index) => (
        <Animated.View
          key={item.label}
          style={[
            styles.fabOption,
            {
              opacity: menuAnimation,
              transform: [
                {
                  translateY: menuAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [100 + index * 60, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            style={[
              styles.fabOptionButton,
              { backgroundColor: getMenuItemColor(item.icon) },
            ]}
            onPress={() => {
              item.action();
              toggleMenu();
            }}
          >
            <MaterialCommunityIcons
              name={item.icon as any}
              size={20}
              color="#fff"
            />
            <Text style={styles.fabOptionText}>{item.label}</Text>
          </Pressable>
        </Animated.View>
      ))}

      <Pressable onPress={toggleMenu} style={styles.fab}>
        <Animated.View
          style={{
            transform: [
              {
                rotate: fabAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "45deg"],
                }),
              },
            ],
          }}
        >
          <MaterialCommunityIcons name="menu" size={28} color="#fff" />
        </Animated.View>
      </Pressable>
    </View>
  );
}
